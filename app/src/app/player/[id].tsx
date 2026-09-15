import { useCallback, useState } from "react";
import { Image, Pressable, StyleSheet, View } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { api, euro, euroShort } from "@/lib/api";
import { useSession } from "@/lib/session";
import { Sparkline } from "@/components/sparkline";
import {
  Body,
  Button,
  Card,
  ErrorText,
  Screen,
  Title,
  useColors,
} from "@/components/ui";
import type { PlayerDetail } from "@/types";

const POSITION: Record<string, string> = {
  GK: "Torwart",
  DEF: "Abwehr",
  MID: "Mittelfeld",
  FWD: "Angriff",
};

export default function PlayerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { token, activeLeagueId } = useSession();
  const router = useRouter();
  const c = useColors();

  const [p, setP] = useState<PlayerDetail | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!activeLeagueId || !id) return;
    try {
      setP(
        await api<PlayerDetail>(`/api/leagues/${activeLeagueId}/players/${id}`, { token }),
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
  if (!p) {
    return (
      <Screen>
        <Body dim>Lädt …</Body>
      </Screen>
    );
  }

  const kurse = p.kursverlauf.map((k) => k.value);
  const veraenderung =
    kurse.length >= 2 ? kurse[kurse.length - 1] - kurse[0] : 0;

  return (
    <Screen>
      <Pressable onPress={() => router.back()}>
        <Body dim>‹ Zurück</Body>
      </Pressable>

      <View style={styles.kopf}>
        {p.photoUrl ? (
          <Image source={{ uri: p.photoUrl }} style={styles.foto} />
        ) : (
          <View style={[styles.foto, { backgroundColor: c.backgroundElement }]} />
        )}
        <View style={{ flex: 1 }}>
          <Title>{p.name}</Title>
          <Body dim>
            {POSITION[p.position]} · {p.team.name}
          </Body>
        </View>
      </View>

      <Card>
        <View style={styles.zeile}>
          <View style={{ flex: 1 }}>
            <Body dim>Marktwert</Body>
            <Body style={styles.gross}>{euro(p.marketValue)}</Body>
          </View>
          {veraenderung !== 0 && (
            <View style={{ alignItems: "flex-end" }}>
              <Body dim>Verlauf</Body>
              <Body style={styles.gross}>
                {veraenderung > 0 ? "▲" : "▼"} {euroShort(Math.abs(veraenderung))}
              </Body>
            </View>
          )}
        </View>
        <Sparkline values={kurse} />
        {p.wertGeschaetzt && (
          <Body dim>
            Geschätzter Startwert — für diesen Spieler gibt es keine
            Vorsaison-Statistik. Der Kurs korrigiert sich mit jedem Spieltag.
          </Body>
        )}
      </Card>

      <Card>
        <View style={styles.zeile}>
          <View style={{ flex: 1 }}>
            <Body dim>Punkte gesamt</Body>
            <Body style={styles.gross}>{p.gesamtpunkte}</Body>
          </View>
          <View style={{ flex: 1 }}>
            <Body dim>Schnitt</Body>
            <Body style={styles.gross}>{p.schnitt ?? "—"}</Body>
          </View>
          <View style={{ flex: 1 }}>
            <Body dim>Spieltage</Body>
            <Body style={styles.gross}>{p.punkteVerlauf.length}</Body>
          </View>
        </View>
        {p.punkteVerlauf.length >= 2 ? (
          <Sparkline values={p.punkteVerlauf.map((x) => x.points)} zeroLine />
        ) : (
          <Body dim>Noch keine Spieltagspunkte erfasst.</Body>
        )}
      </Card>

      {/* Ein Spiel je Zeile, neueste zuerst - die Zahl hinter dem Schnitt. */}
      {p.punkteVerlauf.length > 0 && (
        <Card>
          <Body dim>Punkte je Spiel</Body>
          {[...p.punkteVerlauf].reverse().map((s) => (
            <View key={s.matchday} style={styles.spiel}>
              <Body dim style={styles.spieltag}>
                {s.matchday}.
              </Body>
              <View style={{ flex: 1 }}>
                <Body numberOfLines={1}>
                  {s.gegner
                    ? `${s.heimspiel ? "gegen" : "bei"} ${s.gegner}`
                    : `Spieltag ${s.matchday}`}
                  {s.ergebnis ? ` · ${s.ergebnis}` : ""}
                </Body>
                {s.minuten !== null && <Body dim>{s.minuten} Minuten</Body>}
              </View>
              <Body
                style={[
                  styles.gross,
                  { color: s.points < 0 ? "#E5484D" : c.text },
                ]}
              >
                {s.points > 0 ? `+${s.points}` : s.points}
              </Body>
            </View>
          ))}
        </Card>
      )}

      {p.naechstesSpiel && (
        <Card>
          <Body dim>Nächstes Spiel · Spieltag {p.naechstesSpiel.matchday}</Body>
          <Body style={styles.name}>
            {p.naechstesSpiel.heimspiel ? "gegen" : "bei"} {p.naechstesSpiel.gegner}
          </Body>
          <Body dim>
            {new Date(p.naechstesSpiel.kickoff).toLocaleString("de-DE", {
              weekday: "long",
              day: "2-digit",
              month: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            })}{" "}
            Uhr
          </Body>
        </Card>
      )}

      <Card>
        {p.besitzer ? (
          <>
            <Body dim>{p.besitzer.istMeiner ? "In deinem Kader" : "Gehört"}</Body>
            <Body style={styles.name}>{p.besitzer.teamName}</Body>
            {p.besitzer.istMeiner && (
              <Body dim>
                Gekauft für {euro(p.besitzer.boughtFor)} ·{" "}
                {p.besitzer.gewinn >= 0 ? "Gewinn" : "Verlust"}{" "}
                {euroShort(Math.abs(p.besitzer.gewinn))}
              </Body>
            )}
          </>
        ) : (
          <Body dim>Gehört in dieser Liga niemandem.</Body>
        )}

        {p.angebot && (
          <Body dim>
            Steht auf dem Markt · Mindestgebot {euro(p.angebot.price)}
            {p.angebot.meinGebot ? ` · dein Gebot ${euro(p.angebot.meinGebot)}` : ""}
          </Body>
        )}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  kopf: { flexDirection: "row", alignItems: "center", gap: 14 },
  zeile: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  foto: { width: 64, height: 64, borderRadius: 32 },
  gross: { fontSize: 18, fontWeight: "700" },
  spiel: { flexDirection: "row", alignItems: "center", gap: 10 },
  spieltag: { width: 26, textAlign: "right" },
  name: { fontSize: 16, fontWeight: "600" },
});
