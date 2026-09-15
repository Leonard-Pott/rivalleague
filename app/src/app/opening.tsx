import { useCallback, useEffect, useState } from "react";
import { Image, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { api, euro, euroShort } from "@/lib/api";
import { useSession } from "@/lib/session";
import {
  Body,
  Button,
  Card,
  ErrorText,
  Screen,
  Title,
  useAkzent,
  useColors,
  useTon,
} from "@/components/ui";
import type { Squad, SquadPlayer } from "@/types";

const POSITION: Record<string, string> = {
  GK: "Torwart",
  DEF: "Abwehr",
  MID: "Mittelfeld",
  FWD: "Angriff",
};

/**
 * Die elf gelosten Spieler, einer nach dem anderen. Eine Liste waere schneller
 * zu lesen, aber der Reihe nach aufgedeckt ist es der Moment, an dem die Liga
 * anfaengt - und man sieht jeden Spieler wirklich an, statt ihn zu ueberfliegen.
 */
export default function OpeningScreen() {
  const { token, activeLeagueId } = useSession();
  const router = useRouter();
  const c = useColors();
  const akzent = useAkzent();
  const ton = useTon();

  const [spieler, setSpieler] = useState<SquadPlayer[]>([]);
  const [budget, setBudget] = useState(0);
  const [i, setI] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!activeLeagueId) return;
    api<Squad>(`/api/leagues/${activeLeagueId}/squad`, { token })
      .then((s) => {
        setSpieler(s.spieler);
        setBudget(s.budget);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Laden fehlgeschlagen"));
  }, [activeLeagueId, token]);

  const fertig = useCallback(() => router.replace("/"), [router]);

  if (error) {
    return (
      <Screen>
        <ErrorText>{error}</ErrorText>
        <Button label="Weiter zur Liga" onPress={fertig} />
      </Screen>
    );
  }

  const p = spieler[i];
  const teamValue = spieler.reduce((s, x) => s + x.marketValue, 0);
  const letzter = i >= spieler.length - 1;

  return (
    <Screen>
      <Title>Dein Startkader</Title>
      <Body dim>
        Elf Spieler für rund {euroShort(teamValue)} sind dir zugelost. Dazu{" "}
        {euroShort(budget)} zum Zukaufen.
      </Body>

      {!p && <Body dim>Lädt …</Body>}

      {p && (
        <>
          <Card style={{ backgroundColor: ton, alignItems: "center", gap: 12 }}>
            <Body dim>
              {i + 1} von {spieler.length}
            </Body>
            <View>
              {p.photoUrl ? (
                <Image source={{ uri: p.photoUrl }} style={styles.foto} />
              ) : (
                <View style={[styles.foto, { backgroundColor: c.backgroundSelected }]} />
              )}
              {p.team.logoUrl && (
                <Image
                  source={{ uri: p.team.logoUrl }}
                  style={[styles.wappen, { backgroundColor: c.background }]}
                />
              )}
            </View>
            <Title>{p.name}</Title>
            <Body dim>
              {POSITION[p.position]} · {p.team.name}
            </Body>
            <Body style={[styles.wert, { color: akzent.farbe }]}>
              {euro(p.marketValue)}
            </Body>
          </Card>

          {/* Punkte, damit man sieht, wie voll der Kader schon ist. */}
          <View style={styles.reihe}>
            {spieler.map((x, n) => (
              <View
                key={x.playerId}
                style={[
                  styles.punkt,
                  { backgroundColor: n <= i ? akzent.farbe : c.backgroundSelected },
                ]}
              />
            ))}
          </View>

          <Button
            label={letzter ? "Los geht's" : "Nächster Spieler"}
            onPress={() => (letzter ? fertig() : setI(i + 1))}
          />
          {!letzter && <Button label="Alle überspringen" variant="ghost" onPress={fertig} />}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  foto: { width: 160, height: 160, borderRadius: 80 },
  wappen: {
    position: "absolute",
    right: 0,
    bottom: 0,
    width: 52,
    height: 52,
    borderRadius: 26,
  },
  wert: { fontSize: 22, lineHeight: 28, fontWeight: "700" },
  reihe: { flexDirection: "row", gap: 6, justifyContent: "center" },
  punkt: { width: 10, height: 10, borderRadius: 5 },
});
