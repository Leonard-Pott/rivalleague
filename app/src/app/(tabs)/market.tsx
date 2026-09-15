import { useCallback, useState } from "react";
import { Image, Pressable, RefreshControl, StyleSheet, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { api, euro, euroShort } from "@/lib/api";
import { useSession } from "@/lib/session";
import {
  Body,
  Button,
  Card,
  ErrorText,
  Field,
  Screen,
  Title,
  useAkzent,
  useColors,
  useTon,
} from "@/components/ui";
import type { Market, Offer } from "@/types";

/** "noch 3 Std" statt eines Zeitstempels - die Restzeit ist die Information. */
function restzeit(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "wird abgerechnet";
  const min = Math.round(ms / 60000);
  if (min < 60) return `noch ${min} Min`;
  return `noch ${Math.round(min / 60)} Std`;
}

export default function MarktScreen() {
  const { token, activeLeagueId } = useSession();
  const router = useRouter();
  const c = useColors();
  const akzent = useAkzent();
  const ton = useTon();

  const [markt, setMarkt] = useState<Market | null>(null);
  const [offen, setOffen] = useState<string | null>(null);
  const [betrag, setBetrag] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!activeLeagueId) return;
    setError("");
    try {
      setMarkt(await api<Market>(`/api/leagues/${activeLeagueId}/market`, { token }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Laden fehlgeschlagen");
    }
  }, [activeLeagueId, token]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await fn();
      setOffen(null);
      setBetrag("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Hat nicht geklappt");
    } finally {
      setBusy(false);
    }
  }

  const bieten = (o: Offer) =>
    run(() =>
      api(`/api/leagues/${activeLeagueId}/market/${o.listingId}/bid`, {
        token,
        body: { amount: Number(betrag.replace(/\D/g, "")) },
      }),
    );

  const zurueckziehen = (o: Offer) =>
    run(() =>
      api(`/api/leagues/${activeLeagueId}/market/${o.listingId}/bid`, {
        token,
        method: "DELETE",
      }),
    );

  const vomMarktNehmen = (o: Offer) =>
    run(() =>
      api(`/api/leagues/${activeLeagueId}/market/list`, {
        token,
        method: "DELETE",
        body: { playerId: o.playerId },
      }),
    );

  if (!activeLeagueId) {
    return (
      <Screen insetTop={false}>
        <Title>Markt</Title>
        <Body dim>Erst eine Liga anlegen oder beitreten.</Body>
      </Screen>
    );
  }

  const frei = (markt?.budget ?? 0) - (markt?.gebunden ?? 0);

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
      <Title>Transfermarkt</Title>
      <ErrorText>{error}</ErrorText>

      {markt && (
        <Card>
          <View style={styles.zeile}>
            <View style={{ flex: 1 }}>
              <Body dim>Frei verfügbar</Body>
              <Body style={styles.gross}>{euroShort(frei)}</Body>
            </View>
            <View style={{ flex: 1 }}>
              <Body dim>In Geboten</Body>
              <Body style={styles.gross}>{euroShort(markt.gebunden)}</Body>
            </View>
            <View>
              <Body dim>Kader</Body>
              <Body style={styles.gross}>
                {markt.kaderGroesse}/{markt.maxKader}
              </Body>
            </View>
          </View>
        </Card>
      )}

      {markt?.angebote.map((o) => {
        const aufgeklappt = offen === o.listingId;
        return (
          <Card
            key={o.listingId}
            style={
              o.meinGebot
                ? { borderWidth: 2, borderColor: akzent.farbe, backgroundColor: ton }
                : undefined
            }
          >
            <Pressable
              onPress={() => {
                setOffen(aufgeklappt ? null : o.listingId);
                setBetrag(String(o.meinGebot ?? o.price));
                setError("");
              }}
            >
              <View style={styles.zeile}>
                {o.photoUrl ? (
                  <Image source={{ uri: o.photoUrl }} style={styles.foto} />
                ) : (
                  <View style={[styles.foto, { backgroundColor: c.backgroundSelected }]} />
                )}
                <View style={{ flex: 1 }}>
                  <Body style={styles.name}>{o.name}</Body>
                  <Body dim>
                    {o.position} · {o.team.name}
                  </Body>
                  <Body dim>
                    {o.verkaeufer ? `von ${o.verkaeufer.teamName}` : "vom Markt"} ·{" "}
                    {restzeit(o.expiresAt)}
                  </Body>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Body style={styles.preis}>{euroShort(o.price)}</Body>
                  {o.meinGebot ? (
                    <Body dim>dein Gebot {euroShort(o.meinGebot)}</Body>
                  ) : (
                    <Body dim>Mindestgebot</Body>
                  )}
                </View>
              </View>
            </Pressable>

            {aufgeklappt && (
              <View style={{ gap: 8, marginTop: 4 }}>
                <Button
                  label="Kursverlauf und Statistik"
                  variant="ghost"
                  onPress={() => router.push({ pathname: "/player/[id]", params: { id: String(o.playerId) } })}
                />
                {o.istMeiner ? (
                  <>
                    <Body dim>
                      Dein Spieler steht zum Verkauf. Er bleibt drauf, bis jemand
                      mindestens seinen Marktwert bietet.
                    </Body>
                    <Button
                      label="Vom Markt nehmen"
                      variant="ghost"
                      onPress={() => vomMarktNehmen(o)}
                      busy={busy}
                    />
                  </>
                ) : (
                  <>
                    <Body dim>
                      Mindestgebot {euro(o.price)} · Gebote sind verdeckt, du siehst
                      nur dein eigenes.
                    </Body>
                    <Field
                      value={betrag}
                      onChangeText={setBetrag}
                      keyboardType="number-pad"
                      placeholder="Betrag in Euro"
                    />
                    <Button
                      label={o.meinGebot ? "Gebot ändern" : "Gebot abgeben"}
                      onPress={() => bieten(o)}
                      busy={busy}
                    />
                    {o.meinGebot !== null && (
                      <Button
                        label="Gebot zurückziehen"
                        variant="ghost"
                        onPress={() => zurueckziehen(o)}
                        busy={busy}
                      />
                    )}
                  </>
                )}
              </View>
            )}
          </Card>
        );
      })}

      {markt?.angebote.length === 0 && <Body dim>Gerade steht nichts auf dem Markt.</Body>}
    </Screen>
  );
}

const styles = StyleSheet.create({
  zeile: { flexDirection: "row", alignItems: "center", gap: 12 },
  gross: { fontSize: 18, fontWeight: "700" },
  name: { fontSize: 16, fontWeight: "600" },
  preis: { fontSize: 16, fontWeight: "700" },
  foto: { width: 44, height: 44, borderRadius: 22 },
});
