import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { store } from "./storage";
import { api } from "./api";
import type { Me } from "@/types";

const TOKEN_KEY = "rivalleague.token";
const LEAGUE_KEY = "rivalleague.activeLeague";

type SessionValue = {
  ready: boolean;
  token: string | null;
  me: Me | null;
  activeLeagueId: string | null;
  signIn: (token: string) => Promise<void>;
  signOut: () => Promise<void>;
  setActiveLeague: (id: string | null) => Promise<void>;
  refresh: () => Promise<void>;
};

const Ctx = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [activeLeagueId, setActiveLeagueId] = useState<string | null>(null);

  async function loadMe(t: string | null) {
    if (!t) return setMe(null);
    try {
      setMe(await api<Me>("/api/me", { token: t }));
    } catch {
      // Token abgelaufen oder Server neu aufgesetzt -> sauber ausloggen
      await store.deleteItem(TOKEN_KEY);
      setToken(null);
      setMe(null);
    }
  }

  useEffect(() => {
    (async () => {
      const [t, l] = await Promise.all([
        store.getItem(TOKEN_KEY),
        AsyncStorage.getItem(LEAGUE_KEY),
      ]);
      setToken(t);
      setActiveLeagueId(l);
      await loadMe(t);
      setReady(true);
    })();
  }, []);

  // Erste Liga automatisch aktivieren, damit man nach dem Beitreten direkt drin ist.
  useEffect(() => {
    if (!me?.leagues.length) return;
    const stillValid = me.leagues.some((l) => l.leagueId === activeLeagueId);
    if (!stillValid) void setActiveLeague(me.leagues[0].leagueId);
  }, [me]);

  async function setActiveLeague(id: string | null) {
    setActiveLeagueId(id);
    if (id) await AsyncStorage.setItem(LEAGUE_KEY, id);
    else await AsyncStorage.removeItem(LEAGUE_KEY);
  }

  return (
    <Ctx.Provider
      value={{
        ready,
        token,
        me,
        activeLeagueId,
        signIn: async (t) => {
          await store.setItem(TOKEN_KEY, t);
          setToken(t);
          await loadMe(t);
        },
        signOut: async () => {
          await store.deleteItem(TOKEN_KEY);
          await AsyncStorage.removeItem(LEAGUE_KEY);
          setToken(null);
          setMe(null);
          setActiveLeagueId(null);
        },
        setActiveLeague,
        refresh: () => loadMe(token),
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useSession(): SessionValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSession ausserhalb des SessionProvider");
  return ctx;
}
