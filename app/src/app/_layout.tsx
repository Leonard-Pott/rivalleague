import { DarkTheme, DefaultTheme, Stack, ThemeProvider, useRouter, useSegments } from "expo-router";
import { useEffect } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { SessionProvider, useSession } from "@/lib/session";
import { ThemeProvider as ThemeModeProvider, useThemeMode } from "@/lib/theme";
import { Loading } from "@/components/ui";

function Gate() {
  const { ready, token } = useSession();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (!ready) return;
    const onLogin = segments[0] === "login";
    if (!token && !onLogin) router.replace("/login");
    if (token && onLogin) router.replace("/");
  }, [ready, token, segments]);

  if (!ready) return <Loading />;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="login" />
      <Stack.Screen name="settings" />
      <Stack.Screen name="join/[code]" options={{ presentation: "modal" }} />
    </Stack>
  );
}

function Navigation() {
  const { scheme } = useThemeMode();
  return (
    <ThemeProvider value={scheme === "dark" ? DarkTheme : DefaultTheme}>
      <SessionProvider>
        <Gate />
      </SessionProvider>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeModeProvider>
        <Navigation />
      </ThemeModeProvider>
    </SafeAreaProvider>
  );
}
