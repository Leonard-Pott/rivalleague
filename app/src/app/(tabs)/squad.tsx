import { useCallback, useMemo, useState } from "react";
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
  ACCENT,
  Body,
  Button,
  Card,
  ErrorText,
  Screen,
  Title,
  useColors,
} from "@/components/ui";
import type { LineupState, Position, Squad, SquadPlayer } from "@/types";

/** Die Zahlen in "4-4-2" sind Abwehr, Mittelfeld, Angriff - Torwart ist immer einer. */
function shapeOf(formation: string): Record<Position, number> {
  const [def, mid, fwd] = formation.split("-").map(Number);
  return { GK: 1, DEF: def, MID: mid, FWD: fwd };
}

const REIHENFOLGE: Position[] = ["GK", "DEF", "MID", "FWD"];
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

  const [squad, setSquad] = useState<Squad | null>(null);
  const [lineup, setLineup] = useState<LineupState | null>(null);
  const [formation, setFormation] = useState("4-4-2");
  const [startelf, setStartelf] = useState<number[]>([]);
  /** Position, fuer die gerade ein Spieler gesucht wird. */
  const [wahl, setWahl] = useState<Position | null>(null);
  const [error, setError] = useState("");
  const [hinweis, setHinweis] = useState("");
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!activeLeagueId) return;
    setError("");
    try {
      const [s, l] = await Promise.all([
        api<Squad>(`/api/leagues/${activeLeagueId}/squad`, { token }),
        api<LineupState>(`/api/leagues/${activeLeagueId}/lineup`, { token }),
      ]);
      setSquad(s);
      setLineup(l);
      setFormation(l.formation ?? "4-4-2");
      setStartelf(l.startelf);
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

  /** Aufgestellte Spieler je Position, in der Reihenfolge der Slots. */
  const besetzung = useMemo(() => {
    const nach: Record<Position, SquadPlayer[]> = { GK: [], DEF: [], MID: [], FWD: [] };
    for (const id of startelf) {
      const p = spieler.find((x) => x.playerId === id);
      if (p) nach[p.position].push(p);
    }
    return nach;
  }, [spieler, startelf]);

  const passt = REIHENFOLGE.every((pos) => besetzung[pos].length === shape[pos]);

  /**
   * Beim Formationswechsel bleibt stehen, was in die neue Aufstellung passt -
   * ein Wechsel von 4-4-2 auf 4-3-3 soll nicht die halbe Arbeit wegwerfen.
   */
  function wechsle(f: string) {
    const neu = shapeOf(f);
    setFormation(f);
    setStartelf(
      REIHENFOLGE.flatMap((pos) =>
        besetzung[pos].slice(0, neu[pos]).map((p) => p.playerId),
      ),
    );
    setHinweis("");
  }

  /**
   * Drei Eintraege und keiner mehr: Android zeigt von einem Alert hoechstens
   * drei Knoepfe, ein vierter faellt kommentarlos weg - und das waere hier
   * ausgerechnet "Abbrechen". Aufgestellt wird deshalb auf dem Platz, nicht
   * im Menue.
   */
  function menue(p: SquadPlayer) {
    Alert.alert(
      p.name,
      `${p.team.name} · ${euro(p.marketValue)} · ${p.gesamtpunkte} Punkte${
        p.schnitt === null ? "" : ` (Ø ${p.schnitt})`
      }`,
      [
        {
          text: "Details ansehen",
          onPress: () =>
            router.push({ pathname: "/player/[id]", params: { id: String(p.playerId) } }),
        },
        { text: "Zum Verkauf anbieten", onPress: () => verkaufen(p) },
        { text: "Abbrechen", style: "cancel" },
      ],
    );
  }

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

  async function speichern() {
    setBusy(true);
    setError("");
    setHinweis("");
    try {
      await api(`/api/leagues/${activeLeagueId}/lineup`, {
        token,
        method: "PUT",
        body: { formation, startelf },
      });
      setHinweis("Aufstellung gespeichert.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Speichern fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  if (!activeLeagueId) {
    return (
      <Screen insetTop={false}>
        <Title>Kader</Title>
        <Body dim>Erst eine Liga anlegen oder beitreten.</Body>
      </Screen>
    );
  }

  const bank = spieler.filter((p) => !startelf.includes(p.playerId));
  const auswahl = wahl ? bank.filter((p) => p.position === wahl) : [];

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
                    { backgroundColor: f === formation ? ACCENT : c.backgroundSelected },
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
        onLeer={setWahl}
        onSpieler={(p) =>
          !gesperrt && setStartelf((vorher) => vorher.filter((id) => id !== p.playerId))
        }
        onSpielerLang={menue}
      />
      <Body dim>
        {formation} · {startelf.length}/11 aufgestellt
        {gesperrt
          ? " · eingefroren"
          : " · Tippen nimmt vom Platz, Halten öffnet den Spieler"}
      </Body>

      {REIHENFOLGE.map((pos) => {
        const gruppe = spieler.filter((p) => p.position === pos);
        if (gruppe.length === 0) return null;
        return (
          <View key={pos} style={{ gap: 8 }}>
            <Body dim>
              {LABEL[pos]} · {besetzung[pos].length}/{shape[pos]}
              {besetzung[pos].length === shape[pos] ? " ✓" : ""}
            </Body>
            {gruppe.map((p) => {
              const drin = startelf.includes(p.playerId);
              return (
                <Pressable key={p.playerId} onPress={() => menue(p)}>
                  <Card
                    style={
                      drin
                        ? { borderWidth: 2, borderColor: ACCENT }
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

      {squad && squad.kaderGroesse > 0 && !gesperrt && (
        <Button
          label={passt ? "Aufstellung speichern" : `${startelf.length}/11 aufgestellt`}
          onPress={speichern}
          busy={busy}
          disabled={!passt}
        />
      )}

      <Modal
        visible={wahl !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setWahl(null)}
      >
        <Pressable style={styles.backdrop} onPress={() => setWahl(null)} />
        <View style={[styles.sheet, { backgroundColor: c.background }]}>
          <ScrollView contentContainerStyle={styles.sheetInner}>
            <Body style={styles.gross}>{wahl ? LABEL[wahl] : ""} besetzen</Body>
            {auswahl.length === 0 && (
              <Body dim>
                Kein freier Spieler auf dieser Position. Kauf im Transfermarkt nach.
              </Body>
            )}
            {auswahl.map((p) => (
              <Pressable
                key={p.playerId}
                onPress={() => {
                  setStartelf((vorher) => [...vorher, p.playerId]);
                  setWahl(null);
                }}
              >
                <Card>
                  <SpielerZeile p={p} />
                </Card>
              </Pressable>
            ))}
            <Button label="Abbrechen" variant="ghost" onPress={() => setWahl(null)} />
          </ScrollView>
        </View>
      </Modal>
    </Screen>
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
      <View style={{ alignItems: "flex-end" }}>
        <Body style={styles.punkte}>{p.gesamtpunkte}</Body>
        <Body dim>
          {p.schnitt === null ? "Punkte" : `Ø ${p.schnitt} · ${p.spieltage} Sp.`}
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
