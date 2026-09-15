import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type RefreshControlProps,
  type ViewProps,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Colors } from "@/constants/theme";
import { useAkzent, useThemeMode } from "@/lib/theme";

export function useColors() {
  return Colors[useThemeMode().scheme];
}

/** Vorgabe ohne Lieblingsverein. Wer faerben will, nimmt useAkzent(). */
export const ACCENT = "#208AEF";
export { useAkzent };

/** Vereinsfarbe als leiser Untergrund - fuer das, was einem selbst gehoert. */
export function useTon(): string {
  return useThemeMode().ton;
}

export function Screen({
  children,
  scroll = true,
  refreshControl,
  insetTop = true,
}: {
  children: React.ReactNode;
  scroll?: boolean;
  refreshControl?: React.ReactElement<RefreshControlProps>;
  /** Aus, wenn ueber dem Screen schon eine Kopfzeile den Rand haelt. */
  insetTop?: boolean;
}) {
  const c = useColors();
  const inner = <View style={styles.screenInner}>{children}</View>;
  return (
    <SafeAreaView
      style={[styles.flex, { backgroundColor: c.background }]}
      edges={insetTop ? ["top"] : []}
    >
      {scroll ? (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={refreshControl}
          keyboardShouldPersistTaps="handled"
        >
          {inner}
        </ScrollView>
      ) : (
        inner
      )}
    </SafeAreaView>
  );
}

export function Title({ children }: { children: React.ReactNode }) {
  const c = useColors();
  return <Text style={[styles.title, { color: c.text }]}>{children}</Text>;
}

export function Body({
  children,
  dim,
  style,
  numberOfLines,
}: {
  children: React.ReactNode;
  dim?: boolean;
  style?: object;
  numberOfLines?: number;
}) {
  const c = useColors();
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[styles.body, { color: dim ? c.textSecondary : c.text }, style]}
    >
      {children}
    </Text>
  );
}

export function Card({ children, style, ...rest }: ViewProps) {
  const c = useColors();
  return (
    <View
      style={[styles.card, { backgroundColor: c.backgroundElement }, style]}
      {...rest}
    >
      {children}
    </View>
  );
}

export function Button({
  label,
  onPress,
  busy,
  variant = "primary",
  disabled,
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
  variant?: "primary" | "ghost";
  disabled?: boolean;
}) {
  const c = useColors();
  const akzent = useAkzent();
  const off = disabled || busy;
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      style={({ pressed }) => [
        styles.button,
        variant === "primary"
          ? { backgroundColor: akzent.farbe }
          : { backgroundColor: c.backgroundElement },
        (pressed || off) && { opacity: 0.6 },
      ]}
    >
      {busy ? (
        <ActivityIndicator color={variant === "primary" ? akzent.text : c.text} />
      ) : (
        <Text
          style={[
            styles.buttonLabel,
            { color: variant === "primary" ? akzent.text : c.text },
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

export function Field(props: TextInputProps) {
  const c = useColors();
  return (
    <TextInput
      placeholderTextColor={c.textSecondary}
      {...props}
      style={[
        styles.field,
        { backgroundColor: c.backgroundElement, color: c.text },
        props.style,
      ]}
    />
  );
}

export function ErrorText({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return <Text style={styles.error}>{children}</Text>;
}

export function Loading() {
  const c = useColors();
  return (
    <View style={[styles.flex, styles.center, { backgroundColor: c.background }]}>
      <ActivityIndicator color={c.text} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { alignItems: "center", justifyContent: "center" },
  scrollContent: { flexGrow: 1 },
  screenInner: { padding: 16, gap: 12, flex: 1 },
  title: { fontSize: 28, fontWeight: "700", letterSpacing: -0.5 },
  body: { fontSize: 15, lineHeight: 21 },
  card: { borderRadius: 14, padding: 14, gap: 8 },
  button: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 50,
  },
  buttonLabel: { fontSize: 16, fontWeight: "600" },
  field: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 16,
  },
  error: { color: "#E5484D", fontSize: 14 },
});
