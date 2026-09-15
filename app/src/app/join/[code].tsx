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
  const [gelost, setGelost] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        const res = await api<{ leagueId: string; name: string; gelost?: number }>(
          "/api/leagues/join",
          { token, body: { inviteCode: code } },
        );
        await setActiveLeague(res.leagueId);
        await refresh();
        setMessage(res.name);
        setState("done");
        setGelost(res.gelost ?? 0);
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
      {state === "done" && (
        <Body>
          Du spielst jetzt in „{message}“.
          {gelost > 0 ? ` ${gelost} Spieler warten auf dich.` : ""}
        </Body>
      )}
      {state === "error" && <ErrorText>{message}</ErrorText>}
      {state !== "joining" && (
        <Button
          label={gelost > 0 ? "Kader ansehen" : "Weiter"}
          onPress={() => router.replace(gelost > 0 ? "/opening" : "/")}
        />
      )}
    </Screen>
  );
}
