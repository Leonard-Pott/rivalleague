import { useCallback, useMemo, useRef, useState } from "react";
import {
  Alert,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { api, euro, euroShort } from "@/lib/api";
import { useSession } from "@/lib/session";
import { Formationsfeld } from "@/components/formation";
import {
  Body,
  Button,
  Card,
  ErrorText,
  Screen,
  Title,
  useAkzent,
  useColors,
} from "@/components/ui";
import type { LineupState, Position, Squad, SquadPlayer } from "@/types";

/** Die Zahlen in "4-4-2" sind Abwehr, Mittelfeld, Angriff - Torwart ist immer einer. */
function shapeOf(formation: string): Record<Position, number> {
  const [def, mid, fwd] = formation.split("-").map(Number);
  return { GK: 1, DEF: def, MID: mid, FWD: fwd };
}

const REIHENFOLGE: Position[] = ["GK", "DEF", "MID", "FWD"];

/**
 * Die Aufstellung ist ein Platz je Formationsposition, nicht eine Liste von
 * Spielern: sonst rutscht ein Spieler, den man auf den rechten Aussenposten
 * gesetzt hat, beim Zeichnen nach links auf den ersten freien Platz.
 */
type Plaetze = Record<Position, (number | null)[]>;

function leerePlaetze(shape: Record<Position, number>): Plaetze {
  return {
    GK: Array(shape.GK).fill(null),
    DEF: Array(shape.DEF).fill(null),
    MID: Array(shape.MID).fill(null),
    FWD: Array(shape.FWD).fill(null),
  };
}

/** Die elf Plaetze am Stueck, von hinten nach vorn - dieselbe Zaehlung wie im Server. */
function flachePlaetze(shape: Record<Position, number>): Position[] {
  return REIHENFOLGE.flatMap((pos) => Array<Position>(shape[pos]).fill(pos));
}

/** Nummer des Platzes, wie der Server sie kennt. */
function slotNummer(pos: Position, index: number, shape: Record<Position, number>): number {
  return flachePlaetze(shape).indexOf(pos) + index;
}

/** Aufstellung fuer den Server: ein Eintrag je besetztem Platz. */
function alsStartelf(plaetze: Plaetze, shape: Record<Position, number>) {
  return REIHENFOLGE.flatMap((pos) =>
    plaetze[pos].flatMap((id, i) =>
      id === null ? [] : [{ playerId: id, slot: slotNummer(pos, i, shape) }],
    ),
  );
}

/** Setzt eine gespeicherte Aufstellung wieder auf ihre Plaetze. */
function verteile(
  starter: { playerId: number; slot: number }[],
  spieler: SquadPlayer[],
  shape: Record<Position, number>,
): Plaetze {
  const plaetze = leerePlaetze(shape);
  const flach = flachePlaetze(shape);

  for (const s of starter) {
    const pos = flach[s.slot];
    const p = spieler.find((x) => x.playerId === s.playerId);
    // Position und Platz koennen auseinanderlaufen, wenn ein Spieler den
    // Verein gewechselt hat oder die Formation eine andere ist.
    if (!pos || !p || p.position !== pos) continue;
    const index = s.slot - flach.indexOf(pos);
    if (plaetze[pos][index] === null) plaetze[pos][index] = s.playerId;
  }
  return plaetze;
}

/**
 * Raeumt die Aufstellung in eine andere Formation um: was in die neue Reihe
 * passt, bleibt in seiner Reihenfolge stehen, der Rest faellt heraus. Ein
 * Wechsel von 4-4-2 auf 4-3-3 soll nicht die halbe Arbeit wegwerfen.
 */
function umraeumen(plaetze: Plaetze, shape: Record<Position, number>): Plaetze {
  const neu = leerePlaetze(shape);
  for (const pos of REIHENFOLGE) {
    const besetzt = plaetze[pos].filter((id) => id !== null);
    besetzt.slice(0, shape[pos]).forEach((id, i) => (neu[pos][i] = id));
  }
  return neu;
}
const LABEL: Record<Position, string> = {
  GK: "Tor",
  DEF: "Abwehr",
  MID: "Mittelfeld",
  FWD: "Angriff",
};

export default function SquadScreen() {
  const { token, activeLeagueId } = useSession();
  const router = useRouter();
  const c = useColors();
  const akzent = useAkzent();

  const [squad, setSquad] = useState<Squad | null>(null);
  const [lineup, setLineup] = useState<LineupState | null>(null);
  const [formation, setFormation] = useState("4-4-2");
  const [plaetze, setPlaetze] = useState<Plaetze>(() => leerePlaetze(shapeOf("4-4-2")));
  const [speichert, setSpeichert] = useState(false);
  /**
   * Jede Aenderung geht sofort zum Server, und zwar der Reihe nach: zwei
   * Aufrufe gleichzeitig koennten in falscher Reihenfolge ankommen und die
   * juengere Aufstellung mit der aelteren ueberschreiben.
   */
  const kette = useRef<Promise<void>>(Promise.resolve());
  /** Platz, fuer den gerade ein Spieler gesucht wird. */
  const [wahl, setWahl] = useState<{ pos: Position; index: number } | null>(null);
  /** Spieler aus der Kaderliste, dessen Menue offen ist. */
  const [menue, setMenue] = useState<SquadPlayer | null>(null);
  const [error, setError] = useState("");
  const [hinweis, setHinweis] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!activeLeagueId) return;
    setError("");
    try {
      const [s, l] = await Promise.all([
        api<Squad>(`/api/leagues/${activeLeagueId}/squad`, { token }),
        api<LineupState>(`/api/leagues/${activeLeagueId}/lineup`, { token }),
      ]);
      const f = l.formation ?? "4-4-2";
      setSquad(s);
      setLineup(l);
      setFormation(f);
      setPlaetze(verteile(l.startelf, s.spieler, shapeOf(f)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Laden fehlgeschlagen");
    }
  }, [activeLeagueId, token]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const shape = useMemo(() => shapeOf(formation), [formation]);
  const spieler = useMemo(() => squad?.spieler ?? [], [squad]);
  const gesperrt = lineup?.locked ?? false;

  /** Platz fuer Platz, leere bleiben leer - das Feld zeichnet genau das. */
  const besetzung = useMemo(() => {
    const nach: Record<Position, (SquadPlayer | null)[]> = {
      GK: [],
      DEF: [],
      MID: [],
      FWD: [],
    };
    for (const pos of REIHENFOLGE) {
      nach[pos] = plaetze[pos].map(
        (id) => spieler.find((x) => x.playerId === id) ?? null,
      );
    }
    return nach;
  }, [spieler, plaetze]);

  const aufgestellt = useMemo(
    () => REIHENFOLGE.flatMap((pos) => plaetze[pos].filter((id) => id !== null)),
    [plaetze],
  );

  /**
   * Speichert sofort. Eine halb fertige Aufstellung ist erlaubt - alles andere
   * hiesse, den Stand bis zum elften Spieler in der App zu halten und beim
   * naechsten Blick in den Markt zu verlieren.
   */
  function speichere(neu: Plaetze, f: string) {
    if (!activeLeagueId) return;
    setSpeichert(true);
    setError("");
    setHinweis("");
    kette.current = kette.current
      .then(() =>
        api(`/api/leagues/${activeLeagueId}/lineup`, {
          token,
          method: "PUT",
          body: { formation: f, startelf: alsStartelf(neu, shapeOf(f)) },
        }).then(() => undefined),
      )
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "Speichern fehlgeschlagen"),
      )
      .finally(() => setSpeichert(false));
  }

  function besetze(pos: Position, index: number, playerId: number | null) {
    const neu = {
      ...plaetze,
      [pos]: plaetze[pos].map((id, i) => (i === index ? playerId : id)),
    };
    setPlaetze(neu);
    speichere(neu, formation);
  }

  function wechsle(f: string) {
    const neu = umraeumen(plaetze, shapeOf(f));
    setFormation(f);
    setPlaetze(neu);
    speichere(neu, f);
  }

  /** Rueckfrage, kein Menue - dafuer ist der System-Alert genau richtig. */
  function verkaufen(p: SquadPlayer) {
    Alert.alert(
      `${p.name} verkaufen?`,
      `Er steht dann zum Mindestgebot ${euro(p.marketValue)} auf dem Markt und bleibt dort, bis jemand mindestens seinen Marktwert bietet.`,
      [
        { text: "Abbrechen", style: "cancel" },
        {
          text: "Auf den Markt",
          onPress: async () => {
            try {
              await api(`/api/leagues/${activeLeagueId}/market/list`, {
                token,
                body: { playerId: p.playerId },
              });
              setHinweis(`${p.name} steht jetzt auf dem Markt.`);
              await load();
            } catch (e) {
              setError(e instanceof Error ? e.message : "Hat nicht geklappt");
            }
          },
        },
      ],
    );
  }

  if (!activeLeagueId) {
    return (
      <Screen insetTop={false}>
        <Title>Kader</Title>
        <Body dim>Erst eine Liga anlegen oder beitreten.</Body>
      </Screen>
    );
  }

  const bank = spieler.filter((p) => !aufgestellt.includes(p.playerId));
  const auswahl = wahl ? bank.filter((p) => p.position === wahl.pos) : [];

  return (
    <Screen
      insetTop={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await load();
            setRefreshing(false);
          }}
        />
      }
    >
      <Title>Kader</Title>
      <ErrorText>{error}</ErrorText>

      {squad && (
        <Card>
          <View style={styles.zeile}>
            <View style={{ flex: 1 }}>
              <Body dim>Teamwert</Body>
              <Body style={styles.gross}>{euroShort(squad.teamValue)}</Body>
            </View>
            <View style={{ flex: 1 }}>
              <Body dim>Budget</Body>
              <Body style={styles.gross}>{euroShort(squad.budget)}</Body>
            </View>
            <View>
              <Body dim>Spieler</Body>
              <Body style={styles.gross}>{squad.kaderGroesse}</Body>
            </View>
          </View>
        </Card>
      )}

      {lineup && (
        <Card>
          <Body dim>
            Spieltag {lineup.matchday}
            {lineup.deadline
              ? ` · Anpfiff ${new Date(lineup.deadline).toLocaleString("de-DE", {
                  weekday: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}`
              : ""}
          </Body>
          {gesperrt ? (
            <Body>Der Spieltag läuft — die Aufstellung ist eingefroren.</Body>
          ) : (
            <View style={styles.chips}>
              {lineup.formationen.map((f) => (
                <Pressable
                  key={f}
                  onPress={() => wechsle(f)}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: f === formation ? akzent.farbe : c.backgroundSelected,
                    },
                  ]}
                >
                  <Body style={{ color: f === formation ? "#fff" : c.text }}>{f}</Body>
                </Pressable>
              ))}
            </View>
          )}
        </Card>
      )}

      {hinweis ? <Body dim>{hinweis}</Body> : null}

      {squad?.kaderGroesse === 0 && (
        <Body dim>
          Dein Kader ist leer. Kauf dir im Transfermarkt mindestens elf Spieler.
        </Body>
      )}

      {/* Die Aufstellung auf dem Platz, darunter derselbe Kader als Liste. */}
      <Formationsfeld
        shape={shape}
        besetzung={besetzung}
        gesperrt={gesperrt}
        onPlatz={(pos, index) => setWahl({ pos, index })}
      />
      <Body dim>
        {formation} · {aufgestellt.length}/11 aufgestellt
        {gesperrt ? " · eingefroren" : speichert ? " · speichert …" : " · sofort gespeichert"}
      </Body>

      {REIHENFOLGE.map((pos) => {
        const gruppe = spieler.filter((p) => p.position === pos);
        if (gruppe.length === 0) return null;
        return (
          <View key={pos} style={{ gap: 8 }}>
            <Body dim>
              {LABEL[pos]} · {besetzung[pos].filter((x) => x).length}/{shape[pos]}
              {besetzung[pos].every((x) => x) ? " ✓" : ""}
            </Body>
            {gruppe.map((p) => {
              const drin = aufgestellt.includes(p.playerId);
              return (
                <Pressable key={p.playerId} onPress={() => setMenue(p)}>
                  <Card
                    style={
                      drin
                        ? { borderWidth: 2, borderColor: akzent.farbe }
                        : { opacity: 0.75 }
                    }
                  >
                    <SpielerZeile p={p} />
                  </Card>
                </Pressable>
              );
            })}
          </View>
        );
      })}

      <Bogen
        offen={wahl !== null}
        schliessen={() => setWahl(null)}
        titel={
          wahl
            ? `${LABEL[wahl.pos]} ${besetzung[wahl.pos][wahl.index] ? "austauschen" : "besetzen"}`
            : ""
        }
      >
            {auswahl.length === 0 && (
              <Body dim>
                Kein freier Spieler auf dieser Position. Kauf im Transfermarkt nach.
              </Body>
            )}
            {auswahl.map((p) => (
              <Pressable
                key={p.playerId}
                onPress={() => {
                  if (wahl) besetze(wahl.pos, wahl.index, p.playerId);
                  setWahl(null);
                }}
              >
                <Card>
                  <SpielerZeile p={p} />
                </Card>
              </Pressable>
            ))}
            {wahl && besetzung[wahl.pos][wahl.index] && (
              <Button
                label={`${besetzung[wahl.pos][wahl.index]?.name} rausnehmen`}
                variant="ghost"
                onPress={() => {
                  besetze(wahl.pos, wahl.index, null);
                  setWahl(null);
                }}
              />
            )}
            <Button label="Abbrechen" variant="ghost" onPress={() => setWahl(null)} />
      </Bogen>

      {/* Derselbe Bogen fuer den Spieler aus der Liste - ein System-Alert sah
          daneben wie ein Fremdkoerper aus. */}
      <Bogen
        offen={menue !== null}
        schliessen={() => setMenue(null)}
        titel={menue?.name ?? ""}
      >
        {menue && (
          <>
            <Card>
              <SpielerZeile p={menue} />
            </Card>
            <Button
              label="Details ansehen"
              onPress={() => {
                const id = String(menue.playerId);
                setMenue(null);
                router.push({ pathname: "/player/[id]", params: { id } });
              }}
            />
            <Button
              label="Zum Verkauf anbieten"
              variant="ghost"
              onPress={() => {
                const p = menue;
                setMenue(null);
                verkaufen(p);
              }}
            />
          </>
        )}
        <Button label="Abbrechen" variant="ghost" onPress={() => setMenue(null)} />
      </Bogen>
    </Screen>
  );
}

/** Der Bogen von unten: eine Ueberschrift, Inhalt, und aus ist er beim Tippen daneben. */
function Bogen({
  offen,
  schliessen,
  titel,
  children,
}: {
  offen: boolean;
  schliessen: () => void;
  titel: string;
  children: React.ReactNode;
}) {
  const c = useColors();
  return (
    <Modal visible={offen} transparent animationType="slide" onRequestClose={schliessen}>
      <Pressable style={styles.backdrop} onPress={schliessen} />
      <View style={[styles.sheet, { backgroundColor: c.background }]}>
        <ScrollView contentContainerStyle={styles.sheetInner}>
          <Body style={styles.gross}>{titel}</Body>
          {children}
        </ScrollView>
      </View>
    </Modal>
  );
}

function SpielerZeile({ p }: { p: SquadPlayer }) {
  const c = useColors();
  return (
    <View style={styles.zeile}>
      {p.photoUrl ? (
        <Image source={{ uri: p.photoUrl }} style={styles.foto} />
      ) : (
        <View style={[styles.foto, { backgroundColor: c.backgroundSelected }]} />
      )}
      <View style={{ flex: 1 }}>
        <Body style={styles.name} numberOfLines={1}>
          {p.name}
        </Body>
        <Body dim numberOfLines={1}>
          {p.team.name} · {euroShort(p.marketValue)}
          {p.gewinn !== 0
            ? `  ${p.gewinn > 0 ? "▲" : "▼"} ${euroShort(Math.abs(p.gewinn))}`
            : ""}
        </Body>
      </View>
      {/* Ohne erfassten Spieltag ist eine 0 gelogen: sie hiesse, er habe
          gespielt und nichts geholt. */}
      <View style={{ alignItems: "flex-end" }}>
        <Body style={styles.punkte}>{p.spieltage === 0 ? "–" : p.gesamtpunkte}</Body>
        <Body dim>
          {p.spieltage === 0 ? "noch kein Spiel" : `Ø ${p.schnitt} · ${p.spieltage} Sp.`}
        </Body>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  zeile: { flexDirection: "row", alignItems: "center", gap: 12 },
  gross: { fontSize: 18, fontWeight: "700" },
  name: { fontSize: 16, fontWeight: "600" },
  punkte: { fontSize: 18, fontWeight: "700" },
  foto: { width: 40, height: 40, borderRadius: 20 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  backdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#0008",
  },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: "80%",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
  },
  sheetInner: { padding: 16, gap: 10 },
});
