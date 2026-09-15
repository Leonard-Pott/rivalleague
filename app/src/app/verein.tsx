import { useCallback, useEffect, useState } from "react";
import { Image, Pressable, StyleSheet, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { VEREINSFARBEN, STANDARDFARBE } from "@/constants/vereinsfarben";
import {
  Body,
  Button,
  Card,
  ErrorText,
  Screen,
  Title,
  useColors,
} from "@/components/ui";
import type { TeamSummary } from "@/types";

/**
 * Wahl des Lieblingsvereins. Kommt einmal nach der Anmeldung und danach nur
 * noch ueber das Profil - deshalb fuehrt "zurueck" ins Profil, ausser beim
 * ersten Mal, da geht es in die App.
 */
export default function VereinScreen() {
  const { erst } = useLocalSearchParams<{ erst?: string }>();
  const { token, me, refresh } = useSession();
  const router = useRouter();
  const c = useColors();

  const [teams, setTeams] = useState<TeamSummary[]>([]);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ teams: TeamSummary[] }>("/api/teams", { token })
      .then((r) => setTeams(r.teams))
      .catch((e) => setError(e instanceof Error ? e.message : "Laden fehlgeschlagen"));
  }, [token]);

  const weiter = useCallback(() => {
    if (erst) router.replace("/");
    else router.back();
  }, [erst, router]);

  async function waehle(id: number) {
    setBusy(id);
    setError("");
    try {
      await api("/api/me", { token, method: "PATCH", body: { favoriteTeamId: id } });
      await refresh();
      weiter();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Hat nicht geklappt");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Screen>
      <Title>Dein Verein</Title>
      <Body dim>
        Die App nimmt seine Farbe an. Du kannst ihn später im Profil wechseln.
      </Body>
      <ErrorText>{error}</ErrorText>

      {teams.map((t) => {
        const farbe = VEREINSFARBEN[t.id] ?? STANDARDFARBE;
        const gewaehlt = me?.user.favoriteTeamId === t.id;
        return (
          <Pressable key={t.id} onPress={() => waehle(t.id)} disabled={busy !== null}>
            <Card
              style={[
                styles.zeile,
                gewaehlt && { borderWidth: 2, borderColor: farbe.farbe },
                busy !== null && busy !== t.id && { opacity: 0.5 },
              ]}
            >
              <View style={[styles.balken, { backgroundColor: farbe.farbe }]} />
              {t.logoUrl ? (
                <Image source={{ uri: t.logoUrl }} style={styles.wappen} />
              ) : (
                <View style={[styles.wappen, { backgroundColor: c.backgroundSelected }]} />
              )}
              <Body style={styles.name}>{t.name}</Body>
              {gewaehlt && <Body dim>gewählt</Body>}
            </Card>
          </Pressable>
        );
      })}

      {teams.length === 0 && !error && <Body dim>Lädt …</Body>}

      {!erst && <Button label="Abbrechen" variant="ghost" onPress={weiter} />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  zeile: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  // Ein Streifen in Vereinsfarbe: so sieht man vorher, wie die App aussehen wird.
  balken: { width: 6, height: 40, borderRadius: 3 },
  wappen: { width: 34, height: 34, borderRadius: 17 },
  name: { flex: 1, fontSize: 16, fontWeight: "600" },
});
