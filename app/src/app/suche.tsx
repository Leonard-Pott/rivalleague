import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { api, euroShort } from "@/lib/api";
import { useSession } from "@/lib/session";
import {
  Body,
  Card,
  ErrorText,
  Field,
  Screen,
  SpielerFoto,
  Title,
  Zurueck,
  useAkzent,
  useColors,
  useSchrift,
  useTon,
} from "@/components/ui";
import type { Suchergebnis, Treffer } from "@/types";

/**
 * Spielersuche mit Scouting-Liste. Ohne Suchbegriff stehen hier die
 * beobachteten Spieler - man kommt her, um nachzusehen, wen man sich gemerkt
 * hat, und sucht erst dann weiter.
 */
export default function SucheScreen() {
  const { token, activeLeagueId } = useSession();
  const router = useRouter();
  const c = useColors();
  const akzent = useAkzent();
  const schrift = useSchrift();
  const ton = useTon();

  const [q, setQ] = useState("");
  const [treffer, setTreffer] = useState<Treffer[]>([]);
  const [laeuft, setLaeuft] = useState(false);
  const [error, setError] = useState("");

  const hole = useCallback(
    (begriff: string) =>
      api<Suchergebnis>(
        `/api/leagues/${activeLeagueId}/players?q=${encodeURIComponent(begriff)}`,
        { token },
      ),
    [activeLeagueId, token],
  );

  /**
   * Gesucht wird beim Tippen, aber nicht bei jedem Buchstaben: eine kurze
   * Pause spart dem Server sechs Anfragen fuer einen Namen. Ohne Eingabe holt
   * derselbe Weg die Scouting-Liste.
   */
  useEffect(() => {
    let aktuell = true;
    const warten = setTimeout(() => {
      setLaeuft(true);
      hole(q)
        .then((r) => aktuell && setTreffer(r.treffer))
        .catch(
          (e: unknown) =>
            aktuell &&
            setError(e instanceof Error ? e.message : "Suche fehlgeschlagen"),
        )
        .finally(() => aktuell && setLaeuft(false));
    }, 300);

    return () => {
      aktuell = false;
      clearTimeout(warten);
    };
  }, [q, hole]);

  async function merken(t: Treffer) {
    setTreffer((vorher) =>
      vorher.map((x) => (x.playerId === t.playerId ? { ...x, gemerkt: !x.gemerkt } : x)),
    );
    try {
      await api(`/api/leagues/${activeLeagueId}/players/${t.playerId}`, {
        token,
        method: "PATCH",
        body: { gemerkt: !t.gemerkt },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Hat nicht geklappt");
    }
  }

  return (
    <Screen>
      <Zurueck onPress={() => router.back()} />

      <Title>Suche</Title>

      <Field
        placeholder="Spielername"
        value={q}
        onChangeText={setQ}
        autoCorrect={false}
        autoFocus
        returnKeyType="search"
      />

      <ErrorText>{error}</ErrorText>

      <Body dim>
        {laeuft
          ? "sucht …"
          : `${q.trim() ? `Treffer für „${q.trim()}“` : "Beobachtete Spieler"}${
              treffer.length ? ` · ${treffer.length}` : ""
            }`}
      </Body>

      {treffer.length === 0 && !laeuft && (
        <Body dim>
          {q.trim()
            ? "Niemand gefunden. Ein Teil des Namens reicht."
            : "Noch niemand beobachtet. Such einen Spieler und tipp auf den Stern."}
        </Body>
      )}

      {treffer.map((t) => (
        <Card key={t.playerId} style={t.gemerkt ? { backgroundColor: ton } : undefined}>
          <View style={styles.zeile}>
            <Pressable
              style={styles.wachsend}
              onPress={() =>
                router.push({
                  pathname: "/player/[id]",
                  params: { id: String(t.playerId) },
                })
              }
            >
              <View style={styles.zeile}>
                <SpielerFoto photoUrl={t.photoUrl} logoUrl={t.team.logoUrl} />
                <View style={{ flex: 1 }}>
                  <Body style={styles.name} numberOfLines={1}>
                    {t.name}
                  </Body>
                  <Body dim numberOfLines={1}>
                    {t.position} · {t.team.name} · {euroShort(t.marketValue)}
                  </Body>
                  {/* Die Zeile, wegen der man sucht: ist er ueberhaupt zu haben? */}
                  <Body
                    numberOfLines={1}
                    style={{ color: t.besitzer ? c.textSecondary : schrift }}
                  >
                    {t.besitzer
                      ? t.besitzer.istMeiner
                        ? "in deinem Kader"
                        : `gehört ${t.besitzer.teamName}`
                      : t.imMarkt
                        ? "steht auf dem Markt"
                        : "frei – kommt irgendwann auf den Markt"}
                  </Body>
                </View>
              </View>
            </Pressable>

            <Pressable onPress={() => merken(t)} hitSlop={10}>
              <Body style={[styles.stern, { color: t.gemerkt ? akzent.farbe : c.textSecondary }]}>
                {t.gemerkt ? "★" : "☆"}
              </Body>
            </Pressable>
          </View>
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  zeile: { flexDirection: "row", alignItems: "center", gap: 12 },
  wachsend: { flex: 1 },
  name: { fontSize: 16, fontWeight: "600" },
  stern: { fontSize: 26, lineHeight: 32 },
});
