import { useState } from "react";
import { Image, Modal, Pressable, ScrollView, Share, StyleSheet, View } from "react-native";
import * as Linking from "expo-linking";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { Body, Button, ErrorText, Field, useAkzent, useColors } from "@/components/ui";

/**
 * Kopfzeile ueber allen Tabs: zeigt die aktive Liga und wechselt sie.
 * Liegt bewusst ausserhalb der Tabs - die Liga ist der Kontext, in dem
 * Ranking, Kader, Markt und Aktivitaeten stehen, und kein eigener Ort.
 */
export function LeagueSwitcher() {
  const { me, token, activeLeagueId, setActiveLeague, refresh } = useSession();
  const router = useRouter();
  const akzent = useAkzent();
  const insets = useSafeAreaInsets();
  const c = useColors();
  const [offen, setOffen] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const aktiv = me?.leagues.find((l) => l.leagueId === activeLeagueId);
  const wappen = me?.user.favoriteTeam?.logoUrl ?? null;
  const hellerText = akzent.text !== "#111";

  async function anlegen() {
    setBusy(true);
    setError("");
    try {
      const res = await api<{ leagueId: string }>("/api/leagues", {
        token,
        body: { name: newName },
      });
      setNewName("");
      await refresh();
      await setActiveLeague(res.leagueId);
      setOffen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Hat nicht geklappt");
    } finally {
      setBusy(false);
    }
  }

  return (
    // Der Kopf traegt die Vereinsfarbe. Er ist die einzige Flaeche, die auf
    // jedem Bildschirm zu sehen ist - deshalb faerbt sie die ganze App, ohne
    // dass ein einziger Text unlesbar wird.
    <View style={{ paddingTop: insets.top, backgroundColor: akzent.farbe }}>
      <StatusBar style={hellerText ? "light" : "dark"} />
      <View style={styles.bar}>
        <Pressable
          onPress={() => setOffen(true)}
          style={({ pressed }) => [styles.liga, pressed && { opacity: 0.6 }]}
          accessibilityLabel="Liga wechseln"
        >
          {wappen && (
            <View style={styles.wappenKreis}>
              <Image source={{ uri: wappen }} style={styles.wappen} />
            </View>
          )}
          <Body style={[styles.ligaName, { color: akzent.text }]} numberOfLines={1}>
            {aktiv?.name ?? "Keine Liga"}
          </Body>
          <Body style={[styles.pfeil, { color: akzent.text }]}>▾</Body>
        </Pressable>

        <Pressable
          onPress={() => router.push("/settings")}
          accessibilityLabel="Profil und Einstellungen"
          style={({ pressed }) => pressed && { opacity: 0.6 }}
        >
          <Profilkreis name={me?.user.name} bild={me?.user.image ?? null} invertiert />
        </Pressable>
      </View>

      <Modal
        visible={offen}
        transparent
        animationType="fade"
        onRequestClose={() => setOffen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setOffen(false)} />
        <View
          style={[
            styles.sheet,
            { backgroundColor: c.background, paddingTop: insets.top },
          ]}
        >
          <ScrollView contentContainerStyle={styles.sheetInner} keyboardShouldPersistTaps="handled">
            <Body dim>Liga wechseln</Body>
            <ErrorText>{error}</ErrorText>

            {me?.leagues.map((l) => {
              const ist = l.leagueId === activeLeagueId;
              return (
                <Pressable
                  key={l.leagueId}
                  onPress={async () => {
                    await setActiveLeague(l.leagueId);
                    setOffen(false);
                  }}
                  style={({ pressed }) => [
                    styles.zeile,
                    { backgroundColor: ist ? c.backgroundSelected : c.backgroundElement },
                    pressed && { opacity: 0.6 },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Body style={styles.ligaName}>{l.name}</Body>
                    <Body dim>als {l.teamName}</Body>
                  </View>
                  {ist && <Body dim>aktiv</Body>}
                </Pressable>
              );
            })}

            {!me?.leagues.length && (
              <Body dim>
                Noch keine Liga. Leg eine an – beitreten geht nur über einen
                Einladungslink.
              </Body>
            )}

            <Body dim>Neue Liga</Body>
            <Field placeholder="Liganame" value={newName} onChangeText={setNewName} />
            <Button label="Anlegen" onPress={anlegen} busy={busy} disabled={!newName.trim()} />

            {aktiv && (
              <Button
                label="Einladungslink teilen"
                variant="ghost"
                onPress={() =>
                  Share.share({
                    message: `Komm in meine Rivalleague-Liga „${aktiv.name}“: ${Linking.createURL(`/join/${aktiv.inviteCode}`)}`,
                  })
                }
              />
            )}

            <Button label="Schließen" variant="ghost" onPress={() => setOffen(false)} />
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

/** Foto, sonst der Anfangsbuchstabe - eine leere Scheibe waere kein Profil. */
export function Profilkreis({
  name,
  bild,
  groesse = 34,
  invertiert = false,
}: {
  name?: string;
  bild?: string | null;
  groesse?: number;
  /** Auf farbigem Grund - dort waere ein Kreis in Vereinsfarbe unsichtbar. */
  invertiert?: boolean;
}) {
  const akzent = useAkzent();
  const kreis = { width: groesse, height: groesse, borderRadius: groesse / 2 };
  if (bild) return <Image source={{ uri: bild }} style={kreis} />;
  const grund = invertiert ? akzent.text : akzent.farbe;
  const schrift = invertiert ? akzent.farbe : akzent.text;
  return (
    <View style={[kreis, styles.kreis, { backgroundColor: grund }]}>
      <Body style={[styles.initiale, { fontSize: groesse * 0.45, color: schrift }]}>
        {(name ?? "?").trim().charAt(0).toUpperCase()}
      </Body>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  // Groesserer Griff: die Liga ist der Kontext, in dem alles steht, und war
  // als 17-Punkt-Zeile kaum als Knopf zu erkennen.
  liga: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1 },
  wappenKreis: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  wappen: { width: 24, height: 24 },
  pfeil: { fontSize: 18, opacity: 0.85 },
  kreis: { alignItems: "center", justifyContent: "center" },
  initiale: { fontWeight: "700" },
  ligaName: { fontSize: 22, fontWeight: "700", flexShrink: 1 },
  backdrop: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "#0008" },
  sheet: { maxHeight: "85%", borderBottomLeftRadius: 18, borderBottomRightRadius: 18 },
  sheetInner: { padding: 16, gap: 10 },
  zeile: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 14,
    padding: 14,
  },
});
