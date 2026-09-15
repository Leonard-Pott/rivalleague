import { Tabs } from "expo-router";
import { Text, View, type ColorValue } from "react-native";
import { ACCENT, useColors } from "@/components/ui";
import { LeagueSwitcher } from "@/components/league-switcher";

// Emoji statt Icon-Assets: null Dateien, funktioniert auf allen Plattformen.
// ponytail: SF Symbols wenn es hausbacken aussieht.
const icon = (glyph: string) =>
  function TabIcon({ color }: { color: ColorValue }) {
    return <Text style={{ fontSize: 22, color }}>{glyph}</Text>;
  };

export default function TabsLayout() {
  const c = useColors();
  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <LeagueSwitcher />
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: ACCENT,
          tabBarInactiveTintColor: c.textSecondary,
          tabBarStyle: { backgroundColor: c.background },
        }}
      >
        <Tabs.Screen name="index" options={{ title: "Ranking", tabBarIcon: icon("🏆") }} />
        <Tabs.Screen name="squad" options={{ title: "Kader", tabBarIcon: icon("👕") }} />
        <Tabs.Screen name="market" options={{ title: "Markt", tabBarIcon: icon("💰") }} />
        <Tabs.Screen name="activity" options={{ title: "Aktivität", tabBarIcon: icon("🔔") }} />
      </Tabs>
    </View>
  );
}
