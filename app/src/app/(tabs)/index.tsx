import { useCallback, useState } from "react";
import { RefreshControl, StyleSheet, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { api, euroShort } from "@/lib/api";
import { useSession } from "@/lib/session";
import { Sparkline } from "@/components/sparkline";
import { Body, Card, ErrorText, Screen, Title, useColors } from "@/components/ui";
import type { LeagueDetail } from "@/types";

export default function RankingScreen() {
  const { token, activeLeagueId } = useSession();
  const c = useColors();
  const [data, setData] = useState<LeagueDetail | null>(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!activeLeagueId) return setData(null);
    setError("");
    try {
      setData(await api<LeagueDetail>(`/api/leagues/${activeLeagueId}`, { token }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Laden fehlgeschlagen");
    }
  }, [activeLeagueId, token]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (!activeLeagueId) {
    return (
      <Screen insetTop={false}>
        <Title>Ranking</Title>
        <Body dim>Leg oben im Menü eine Liga an oder tritt per Einladungslink bei.</Body>
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
      <Title>Ranking</Title>
      <ErrorText>{error}</ErrorText>

      {data && (
        <>
          <Card>
            <Body dim>Dein Team</Body>
            <Body style={styles.big}>{data.me.teamName}</Body>
            <Body dim>
              Budget {euroShort(data.me.budget)} · Spieltag {data.spieltag.matchday}
              {data.spieltag.locked ? " läuft" : ""}
            </Body>
            {data.me.verlauf.length >= 2 && (
              <>
                <Body dim>Gesamtvermögen</Body>
                <Sparkline values={data.me.verlauf.map((v) => v.gesamt)} height={70} />
              </>
            )}
          </Card>

          {data.syncHinweise.length > 0 && (
            <Card>
              <Body dim>Datenabgleich klemmt gerade:</Body>
              {data.syncHinweise.map((h) => (
                <Body key={h} dim>
                  · {h}
                </Body>
              ))}
            </Card>
          )}

          {data.table.map((row) => (
            <Card
              key={row.managerId}
              style={row.isMe ? { borderWidth: 1, borderColor: c.textSecondary } : undefined}
            >
              <View style={styles.row}>
                <Body style={styles.rank}>{row.rank}</Body>
                <View style={{ flex: 1 }}>
                  <Body style={styles.name}>{row.teamName}</Body>
                  <Body dim>
                    Teamwert {euroShort(row.teamValue)} · {row.squadSize} Spieler
                  </Body>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Body style={styles.points}>{row.totalPoints}</Body>
                  <Body dim>Punkte</Body>
                </View>
              </View>
            </Card>
          ))}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  rank: { fontSize: 17, fontWeight: "700", width: 24 },
  name: { fontSize: 16, fontWeight: "600" },
  points: { fontSize: 20, fontWeight: "700" },
  big: { fontSize: 20, fontWeight: "700" },
});
