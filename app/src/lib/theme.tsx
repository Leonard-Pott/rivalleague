import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSession } from "@/lib/session";
import { STANDARDFARBE, VEREINSFARBEN, type Vereinsfarbe } from "@/constants/vereinsfarben";

const KEY = "rivalleague.theme";

export type ThemeMode = "system" | "light" | "dark";
export type Scheme = "light" | "dark";

type Value = {
  mode: ThemeMode;
  scheme: Scheme;
  setMode: (m: ThemeMode) => void;
  /** Farbe des Lieblingsvereins, sonst das Blau der App. */
  akzent: Vereinsfarbe;
  /** Dieselbe Farbe als leiser Untergrund, fuer hervorgehobene Karten. */
  ton: string;
};

const Ctx = createContext<Value | null>(null);

/**
 * Hell oder dunkel, und wer das entscheidet. "system" folgt dem Telefon -
 * das ist die Vorgabe, weil die meisten ihre Wahl dort einmal treffen und
 * nicht in jeder App wiederholen wollen.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const vomSystem = useColorScheme();
  const { me } = useSession();
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

  // Dieselbe Farbe in hell und dunkel: Schalkes Blau ist Schalkes Blau, und
  // eine Vereinsfarbe, die je nach Modus anders aussieht, ist keine.
  const verein = me?.user.favoriteTeam?.id;
  const akzent = (verein && VEREINSFARBEN[verein]) || STANDARDFARBE;
  const ton = `${akzent.farbe}${scheme === "dark" ? "33" : "1A"}`;

  return (
    <Ctx.Provider value={{ mode, scheme, setMode, akzent, ton }}>{children}</Ctx.Provider>
  );
}

export function useThemeMode(): Value {
  const ctx = useContext(Ctx);
  // Ohne Provider bleibt es hell - besser als ein Absturz im Modal-Baum.
  return (
    ctx ?? {
      mode: "system",
      scheme: "light",
      setMode: () => {},
      akzent: STANDARDFARBE,
      ton: `${STANDARDFARBE.farbe}1A`,
    }
  );
}

/** Kurzer Weg zur Vereinsfarbe, weil fast jeder Aufrufer nur die braucht. */
export function useAkzent(): Vereinsfarbe {
  return useThemeMode().akzent;
}
