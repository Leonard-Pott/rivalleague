import { useEffect, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { Body, Button, ErrorText, Screen, Title } from "@/components/ui";

/** Ziel des Einladungs-Deep-Links: rivalleague://join/ABC123 */
export default function JoinScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const { token, setActiveLeague, refresh } = useSession();
  const router = useRouter();
  const [state, setState] = useState<"joining" | "done" | "error">("joining");
  const [message, setMessage] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await api<{ leagueId: string; name: string }>(
          "/api/leagues/join",
          { token, body: { inviteCode: code } },
        );
        await setActiveLeague(res.leagueId);
        await refresh();
        setMessage(res.name);
        setState("done");
      } catch (e) {
        setMessage(e instanceof Error ? e.message : "Beitritt fehlgeschlagen");
        setState("error");
      }
    })();
  }, [code]);

  return (
    <Screen>
      <Title>{state === "done" ? "Drin!" : "Liga beitreten"}</Title>
      {state === "joining" && <Body dim>Code {code} wird geprüft …</Body>}
      {state === "done" && <Body>Du spielst jetzt in „{message}“.</Body>}
      {state === "error" && <ErrorText>{message}</ErrorText>}
      {state !== "joining" && (
        <Button label="Weiter" onPress={() => router.replace("/")} />
      )}
    </Screen>
  );
}
