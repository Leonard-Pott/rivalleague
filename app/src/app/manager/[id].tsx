import { useCallback, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { api, euro, euroShort } from "@/lib/api";
import { useSession } from "@/lib/session";
import {
  Body,
  Button,
  Card,
  ErrorText,
  Screen,
  SpielerFoto,
  Title,
  Zurueck,
  useColors,
} from "@/components/ui";
import type { ManagerDetail, Position } from "@/types";

const REIHENFOLGE: Position[] = ["GK", "DEF", "MID", "FWD"];
const LABEL: Record<Position, string> = {
  GK: "Tor",
  DEF: "Abwehr",
  MID: "Mittelfeld",
  FWD: "Angriff",
};

/** Der Kader eines Mitspielers - wer vorne steht, soll zeigen, womit. */
export default function ManagerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { token, activeLeagueId } = useSession();
  const router = useRouter();
  const c = useColors();

  const [m, setM] = useState<ManagerDetail | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!activeLeagueId || !id) return;
    try {
      setM(
        await api<ManagerDetail>(`/api/leagues/${activeLeagueId}/managers/${id}`, {
          token,
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Laden fehlgeschlagen");
    }
  }, [activeLeagueId, id, token]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (error) {
    return (
      <Screen>
        <ErrorText>{error}</ErrorText>
        <Button label="Zurück" variant="ghost" onPress={() => router.back()} />
      </Screen>
    );
  }
  if (!m) {
    return (
      <Screen>
        <Body dim>Lädt …</Body>
      </Screen>
    );
  }

  return (
    <Screen>
      <Zurueck onPress={() => router.back()} />

      <Title>{m.teamName}</Title>
      <Body dim>von {m.managerName}</Body>

      <Card>
        <View style={styles.zeile}>
          <View style={{ flex: 1 }}>
            <Body dim>Teamwert</Body>
            <Body style={styles.gross}>{euroShort(m.teamValue)}</Body>
          </View>
          <View style={{ flex: 1 }}>
            <Body dim>Budget</Body>
            <Body style={styles.gross}>{euroShort(m.budget)}</Body>
          </View>
          <View>
            <Body dim>Punkte</Body>
            <Body style={styles.gross}>{m.gesamtpunkte}</Body>
          </View>
        </View>
      </Card>

      {m.spieler.length === 0 && <Body dim>Dieser Kader ist noch leer.</Body>}

      {REIHENFOLGE.map((pos) => {
        const gruppe = m.spieler.filter((p) => p.position === pos);
        if (gruppe.length === 0) return null;
        return (
          <View key={pos} style={{ gap: 8 }}>
            <Body dim>
              {LABEL[pos]} · {gruppe.length}
            </Body>
            {gruppe.map((p) => (
              <Pressable
                key={p.playerId}
                onPress={() =>
                  router.push({
                    pathname: "/player/[id]",
                    params: { id: String(p.playerId) },
                  })
                }
              >
                <Card>
                  <View style={styles.zeile}>
                    <SpielerFoto photoUrl={p.photoUrl} logoUrl={p.team.logoUrl} />
                    <View style={{ flex: 1 }}>
                      <Body style={styles.name} numberOfLines={1}>
                        {p.name}
                      </Body>
                      <Body dim numberOfLines={1}>
                        {p.team.name} · {euro(p.marketValue)}
                      </Body>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <Body style={styles.gross}>
                        {p.spieltage === 0 ? "–" : p.gesamtpunkte}
                      </Body>
                      <Body dim>
                        {p.spieltage === 0 ? "noch kein Spiel" : `Ø ${p.schnitt}`}
                      </Body>
                    </View>
                  </View>
                </Card>
              </Pressable>
            ))}
          </View>
        );
      })}

      <Body dim style={{ color: c.textSecondary }}>
        Tippen öffnet den Spieler.
      </Body>
    </Screen>
  );
}

const styles = StyleSheet.create({
  zeile: { flexDirection: "row", alignItems: "center", gap: 12 },
  gross: { fontSize: 18, lineHeight: 24, fontWeight: "700" },
  name: { fontSize: 16, fontWeight: "600" },
});
