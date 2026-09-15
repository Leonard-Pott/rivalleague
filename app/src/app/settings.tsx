import { Pressable, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { useSession } from "@/lib/session";
import { useThemeMode, type ThemeMode } from "@/lib/theme";
import { Profilkreis } from "@/components/league-switcher";
import { ACCENT, Body, Button, Card, Screen, Title, useColors } from "@/components/ui";

const ANZEIGE: { mode: ThemeMode; label: string; hinweis: string }[] = [
  { mode: "system", label: "System", hinweis: "folgt dem Telefon" },
  { mode: "light", label: "Hell", hinweis: "immer hell" },
  { mode: "dark", label: "Dunkel", hinweis: "immer dunkel" },
];

export default function SettingsScreen() {
  const { me, signOut } = useSession();
  const { mode, setMode } = useThemeMode();
  const router = useRouter();
  const c = useColors();

  return (
    <Screen>
      <Pressable onPress={() => router.back()}>
        <Body dim>‹ Zurück</Body>
      </Pressable>

      <View style={styles.kopf}>
        <Profilkreis name={me?.user.name} bild={me?.user.image ?? null} groesse={64} />
        <View style={{ flex: 1 }}>
          <Title>{me?.user.name ?? "Profil"}</Title>
          <Body dim>
            {me?.leagues.length
              ? `${me.leagues.length} ${me.leagues.length === 1 ? "Liga" : "Ligen"}`
              : "noch keine Liga"}
          </Body>
        </View>
      </View>

      <Card>
        <Body dim>Anzeige</Body>
        <View style={styles.chips}>
          {ANZEIGE.map((a) => {
            const gewaehlt = a.mode === mode;
            return (
              <Pressable
                key={a.mode}
                onPress={() => setMode(a.mode)}
                style={[
                  styles.chip,
                  { backgroundColor: gewaehlt ? ACCENT : c.backgroundSelected },
                ]}
              >
                <Body style={{ color: gewaehlt ? "#fff" : c.text }}>{a.label}</Body>
              </Pressable>
            );
          })}
        </View>
        <Body dim>{ANZEIGE.find((a) => a.mode === mode)?.hinweis}</Body>
      </Card>

      <Card>
        <Body dim>Konto</Body>
        <Body>
          Angemeldet über den Entwicklungs-Login. Echtes Google-Konto kommt, sobald der
          Server unter fester Adresse läuft.
        </Body>
      </Card>

      <Button
        label="Abmelden"
        variant="ghost"
        onPress={async () => {
          router.back();
          await signOut();
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  kopf: { flexDirection: "row", alignItems: "center", gap: 14 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10 },
});
