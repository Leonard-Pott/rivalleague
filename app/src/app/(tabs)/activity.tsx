import { useCallback, useState } from "react";
import { Pressable, RefreshControl, StyleSheet, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { api, euroShort } from "@/lib/api";
import { useSession } from "@/lib/session";
import {
  Body,
  Card,
  ErrorText,
  Screen,
  SpielerFoto,
  Title,
  useAkzent,
  useTon,
} from "@/components/ui";
import type { Activity, ActivityEntry } from "@/types";

/** "vor 3 Std" - bei einem Feed zaehlt der Abstand, nicht das Datum. */
function vorZeit(iso: string): string {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "gerade eben";
  if (min < 60) return `vor ${min} Min`;
  const std = Math.round(min / 60);
  if (std < 24) return `vor ${std} Std`;
  return `vor ${Math.round(std / 24)} Tagen`;
}

function zeile(e: ActivityEntry): string {
  if (e.art === "angebot") {
    return e.verkaeufer ? `${e.verkaeufer.teamName} bietet an` : "neu auf dem Markt";
  }
  return e.verkaeufer
    ? `${e.verkaeufer.teamName} → ${e.kaeufer?.teamName}`
    : `${e.kaeufer?.teamName} kauft vom Markt`;
}

export default function ActivityScreen() {
  const { token, activeLeagueId } = useSession();
  const router = useRouter();
  const akzent = useAkzent();
  const ton = useTon();
  const [data, setData] = useState<Activity | null>(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!activeLeagueId) return setData(null);
    setError("");
    try {
      setData(await api<Activity>(`/api/leagues/${activeLeagueId}/activity`, { token }));
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
        <Title>Aktivität</Title>
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
      <Title>Aktivität</Title>
      <ErrorText>{error}</ErrorText>

      {data?.eintraege.length === 0 && (
        <Body dim>Noch nichts passiert. Sobald jemand kauft oder verkauft, steht es hier.</Body>
      )}

      {data?.eintraege.map((e) => (
        <Card
          key={e.id}
          // Was mit dem eigenen Team zu tun hat, traegt die Vereinsfarbe -
          // derselbe Griff wie in Tabelle, Kader und Markt.
          style={
            e.binIchBeteiligt
              ? { borderWidth: 2, borderColor: akzent.farbe, backgroundColor: ton }
              : undefined
          }
        >
          <Pressable
            onPress={() =>
              router.push({ pathname: "/player/[id]", params: { id: String(e.playerId) } })
            }
          >
            <View style={styles.row}>
              <SpielerFoto photoUrl={e.photoUrl} logoUrl={e.team.logoUrl} />
              <View style={{ flex: 1 }}>
                <Body style={styles.name} numberOfLines={1}>
                  {e.name}
                </Body>
                <Body dim numberOfLines={1}>
                  {e.position} · {e.team.name}
                </Body>
                <Body dim numberOfLines={1}>
                  {zeile(e)} · {vorZeit(e.zeit)}
                </Body>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Body style={styles.preis}>{euroShort(e.preis)}</Body>
                <Body dim>{e.art === "angebot" ? "Mindestgebot" : "Ablöse"}</Body>
              </View>
            </View>
          </Pressable>
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  foto: { width: 44, height: 44, borderRadius: 22 },
  name: { fontSize: 16, fontWeight: "600" },
  preis: { fontSize: 17, fontWeight: "700" },
});
