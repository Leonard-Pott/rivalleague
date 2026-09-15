import { DarkTheme, DefaultTheme, Stack, ThemeProvider, useRouter, useSegments } from "expo-router";
import { useEffect } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { SessionProvider, useSession } from "@/lib/session";
import { ThemeProvider as ThemeModeProvider, useThemeMode } from "@/lib/theme";
import { Loading } from "@/components/ui";

function Gate() {
  const { ready, token, me } = useSession();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (!ready) return;
    const onLogin = segments[0] === "login";
    const onVerein = segments[0] === "verein";
    if (!token && !onLogin) return router.replace("/login");
    if (token && onLogin) return router.replace("/");
    // Ohne Lieblingsverein geht es einmal durch die Wahl - die Farbe der App
    // haengt daran, und spaeter fragt niemand mehr danach.
    if (token && me && !me.user.favoriteTeam && !onVerein) {
      router.replace("/verein?erst=1");
    }
  }, [ready, token, me, segments]);

  if (!ready) return <Loading />;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="login" />
      <Stack.Screen name="settings" />
      <Stack.Screen name="verein" />
      <Stack.Screen name="join/[code]" options={{ presentation: "modal" }} />
    </Stack>
  );
}

function Navigation() {
  const { scheme } = useThemeMode();
  return (
    <ThemeProvider value={scheme === "dark" ? DarkTheme : DefaultTheme}>
      <Gate />
    </ThemeProvider>
  );
}

// Die Sitzung liegt aussen: die Vereinsfarbe haengt am angemeldeten Nutzer,
// das Thema muss sie also lesen koennen.
export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <ThemeModeProvider>
          <Navigation />
        </ThemeModeProvider>
      </SessionProvider>
    </SafeAreaProvider>
  );
}
