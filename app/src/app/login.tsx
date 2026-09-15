import { useState } from "react";
import { View } from "react-native";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { Body, Button, ErrorText, Field, Screen, Title } from "@/components/ui";
import type { AuthResponse } from "@/types";

export default function Login() {
  const { signIn } = useSession();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setBusy(true);
    setError("");
    try {
      const res = await api<AuthResponse>("/api/auth/dev-login", {
        body: { name },
      });
      await signIn(res.token);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Anmeldung fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <View style={{ flex: 1, justifyContent: "center", gap: 14 }}>
        <Title>Rivalleague</Title>
        <Body dim>
          Entwicklungs-Anmeldung. Name eintippen, fertig — echter Google-Login
          kommt, sobald der Server unter einer festen Adresse läuft.
        </Body>
        <Field
          placeholder="Dein Name"
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
          onSubmitEditing={submit}
          returnKeyType="go"
        />
        <ErrorText>{error}</ErrorText>
        <Button label="Los geht's" onPress={submit} busy={busy} disabled={!name.trim()} />
      </View>
    </Screen>
  );
}
