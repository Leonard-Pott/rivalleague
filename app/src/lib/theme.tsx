import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "rivalleague.theme";

export type ThemeMode = "system" | "light" | "dark";
export type Scheme = "light" | "dark";

type Value = { mode: ThemeMode; scheme: Scheme; setMode: (m: ThemeMode) => void };

const Ctx = createContext<Value | null>(null);

/**
 * Hell oder dunkel, und wer das entscheidet. "system" folgt dem Telefon -
 * das ist die Vorgabe, weil die meisten ihre Wahl dort einmal treffen und
 * nicht in jeder App wiederholen wollen.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const vomSystem = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>("system");

  useEffect(() => {
    void AsyncStorage.getItem(KEY).then((gespeichert) => {
      if (gespeichert === "light" || gespeichert === "dark" || gespeichert === "system") {
        setModeState(gespeichert);
      }
    });
  }, []);

  function setMode(m: ThemeMode) {
    setModeState(m);
    void AsyncStorage.setItem(KEY, m);
  }

  const scheme: Scheme = mode === "system" ? (vomSystem === "dark" ? "dark" : "light") : mode;

  return <Ctx.Provider value={{ mode, scheme, setMode }}>{children}</Ctx.Provider>;
}

export function useThemeMode(): Value {
  const ctx = useContext(Ctx);
  // Ohne Provider bleibt es hell - besser als ein Absturz im Modal-Baum.
  return ctx ?? { mode: "system", scheme: "light", setMode: () => {} };
}
