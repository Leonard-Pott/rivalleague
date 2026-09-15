import Constants from "expo-constants";

/**
 * Das iPhone kann "localhost" nicht erreichen - dahinter steckt der Rechner
 * des Handys, nicht der Entwicklungsrechner. Expo kennt aber die IP, ueber
 * die das Handy gerade den Metro-Bundler erreicht: dieselbe IP hostet auch
 * das Backend. Damit entfaellt jedes manuelle Eintragen der WLAN-Adresse.
 */
function devApiBase(): string {
  const host = Constants.expoConfig?.hostUri?.split(":")[0];
  return host ? `http://${host}:3000` : "http://localhost:3000";
}

export const API_BASE = process.env.EXPO_PUBLIC_API_BASE || devApiBase();
