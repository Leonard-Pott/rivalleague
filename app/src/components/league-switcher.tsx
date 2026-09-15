import { useState } from "react";
import { Modal, Pressable, ScrollView, Share, StyleSheet, View } from "react-native";
import * as Linking from "expo-linking";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { Body, Button, ErrorText, Field, useColors } from "@/components/ui";

/**
 * Kopfzeile ueber allen Tabs: zeigt die aktive Liga und wechselt sie.
 * Liegt bewusst ausserhalb der Tabs - die Liga ist der Kontext, in dem
 * Ranking, Kader, Markt und Aktivitaeten stehen, und kein eigener Ort.
 */
export function LeagueSwitcher() {
  const { me, token, activeLeagueId, setActiveLeague, refresh, signOut } = useSession();
  const insets = useSafeAreaInsets();
  const c = useColors();
  const [offen, setOffen] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const aktiv = me?.leagues.find((l) => l.leagueId === activeLeagueId);

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
    <View style={{ paddingTop: insets.top, backgroundColor: c.background }}>
      <Pressable
        onPress={() => setOffen(true)}
        style={({ pressed }) => [styles.bar, pressed && { opacity: 0.6 }]}
      >
        <Body style={styles.ligaName}>{aktiv?.name ?? "Keine Liga"}</Body>
        <Body dim>▾</Body>
      </Pressable>

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
            <Button
              label="Abmelden"
              variant="ghost"
              onPress={async () => {
                setOffen(false);
                await signOut();
              }}
            />
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  ligaName: { fontSize: 17, fontWeight: "700" },
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
