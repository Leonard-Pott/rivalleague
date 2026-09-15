import { useCallback, useMemo, useState } from "react";
import { Alert, Image, Pressable, RefreshControl, StyleSheet, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { api, euro, euroShort } from "@/lib/api";
import { useSession } from "@/lib/session";
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

  const gezaehlt = useMemo(() => {
    const counts: Record<Position, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
    for (const p of squad?.spieler ?? []) {
      if (startelf.includes(p.playerId)) counts[p.position]++;
    }
    return counts;
  }, [squad, startelf]);

  const passt = REIHENFOLGE.every((pos) => gezaehlt[pos] === shape[pos]);

  function toggle(p: SquadPlayer) {
    if (lineup?.locked) return;
    setHinweis("");
    setStartelf((vorher) => {
      if (vorher.includes(p.playerId)) {
        return vorher.filter((id) => id !== p.playerId);
      }
      if (gezaehlt[p.position] >= shape[p.position]) {
        setHinweis(
          `${LABEL[p.position]} ist voll (${shape[p.position]}). Erst jemanden herausnehmen.`,
        );
        return vorher;
      }
      return [...vorher, p.playerId];
    });
  }

  function menue(p: SquadPlayer) {
    Alert.alert(p.name, `${p.team.name} · ${euro(p.marketValue)}`, [
      { text: "Details ansehen", onPress: () => router.push({ pathname: "/player/[id]", params: { id: String(p.playerId) } }) },
      { text: "Zum Verkauf anbieten", onPress: () => verkaufen(p) },
      { text: "Abbrechen", style: "cancel" },
    ]);
  }

  function verkaufen(p: SquadPlayer) {
    Alert.alert(
      `${p.name} verkaufen?`,
      `Er kommt bis zum Marktschluss zum Mindestgebot ${euro(p.marketValue)} auf den Markt. Findet sich kein Käufer, bleibt er in deinem Kader.`,
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
          {lineup.locked ? (
            <Body>Der Spieltag läuft — die Aufstellung ist eingefroren.</Body>
          ) : (
            <View style={styles.chips}>
              {lineup.formationen.map((f) => (
                <Pressable
                  key={f}
                  onPress={() => {
                    setFormation(f);
                    setStartelf([]);
                    setHinweis("Formation gewechselt, Startelf zurückgesetzt.");
                  }}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: f === formation ? ACCENT : c.backgroundSelected,
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

      {(squad?.kaderGroesse ?? 0) > 0 && (
        <Body dim>Tippen stellt auf, langes Tippen öffnet Details und Verkauf.</Body>
      )}

      {squad?.kaderGroesse === 0 && (
        <Body dim>
          Dein Kader ist leer. Kauf dir im Transfermarkt mindestens elf Spieler.
        </Body>
      )}

      {REIHENFOLGE.map((pos) => {
        const spieler = (squad?.spieler ?? []).filter((p) => p.position === pos);
        if (spieler.length === 0) return null;
        const voll = gezaehlt[pos] === shape[pos];
        return (
          <View key={pos} style={{ gap: 8 }}>
            <Body dim>
              {LABEL[pos]} · {gezaehlt[pos]}/{shape[pos]}
              {voll ? " ✓" : ""}
            </Body>
            {spieler.map((p) => {
              const drin = startelf.includes(p.playerId);
              return (
                <Pressable
                  key={p.playerId}
                  onPress={() => toggle(p)}
                  onLongPress={() => menue(p)}
                >
                  <Card
                    style={
                      drin ? { borderWidth: 2, borderColor: ACCENT } : { opacity: 0.75 }
                    }
                  >
                    <View style={styles.zeile}>
                      {p.photoUrl ? (
                        <Image source={{ uri: p.photoUrl }} style={styles.foto} />
                      ) : (
                        <View style={[styles.foto, { backgroundColor: c.backgroundSelected }]} />
                      )}
                      <View style={{ flex: 1 }}>
                        <Body style={styles.name}>{p.name}</Body>
                        <Body dim>
                          {p.team.name} · {euroShort(p.marketValue)}
                          {p.gewinn !== 0
                            ? `  ${p.gewinn > 0 ? "▲" : "▼"} ${euroShort(Math.abs(p.gewinn))}`
                            : ""}
                        </Body>
                      </View>
                      <View style={{ alignItems: "flex-end" }}>
                        <Body style={styles.punkte}>{p.gesamtpunkte}</Body>
                        <Body dim>Punkte</Body>
                      </View>
                    </View>
                  </Card>
                </Pressable>
              );
            })}
          </View>
        );
      })}

      {squad && squad.kaderGroesse > 0 && !lineup?.locked && (
        <Button
          label={passt ? "Aufstellung speichern" : `${startelf.length}/11 aufgestellt`}
          onPress={speichern}
          busy={busy}
          disabled={!passt}
        />
      )}
    </Screen>
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
});
