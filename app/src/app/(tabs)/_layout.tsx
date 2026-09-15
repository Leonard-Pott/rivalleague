import { Tabs } from "expo-router";
import { Image, View, type ColorValue, type ImageSourcePropType } from "react-native";
import { ACCENT, useColors } from "@/components/ui";
import { LeagueSwitcher } from "@/components/league-switcher";

// Einfarbige PNGs, per tintColor eingefaerbt - damit folgt das Symbol dem
// aktiven Tab, ohne dass es jedes Icon zweimal braucht.
const icon = (src: ImageSourcePropType) =>
  function TabIcon({ color }: { color: ColorValue }) {
    return <Image source={src} style={{ width: 26, height: 26, tintColor: color }} />;
  };

export default function TabsLayout() {
  const c = useColors();
  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <LeagueSwitcher />
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarShowLabel: false,
          tabBarActiveTintColor: ACCENT,
          tabBarInactiveTintColor: c.textSecondary,
          tabBarStyle: { backgroundColor: c.background },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{ title: "Ranking", tabBarIcon: icon(require("@/assets/images/tabs/ranking.png")) }}
        />
        <Tabs.Screen
          name="squad"
          options={{ title: "Kader", tabBarIcon: icon(require("@/assets/images/tabs/kader.png")) }}
        />
        <Tabs.Screen
          name="market"
          options={{ title: "Markt", tabBarIcon: icon(require("@/assets/images/tabs/markt.png")) }}
        />
        <Tabs.Screen
          name="activity"
          options={{ title: "Aktivität", tabBarIcon: icon(require("@/assets/images/tabs/aktivitaet.png")) }}
        />
      </Tabs>
    </View>
  );
}
