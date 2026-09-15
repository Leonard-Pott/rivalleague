import { Image, Pressable, StyleSheet, View } from "react-native";
import { Body } from "@/components/ui";
import type { Position, SquadPlayer } from "@/types";

/** Von hinten nach vorn - so wird das Feld von unten nach oben gezeichnet. */
const REIHEN: Position[] = ["GK", "DEF", "MID", "FWD"];

const RASEN = "#1F7A4C";
const STREIFEN = "#238A56";
const LINIE = "#FFFFFF55";

/**
 * Die Startelf als Formation auf dem Platz, wie die Aufstellungsgrafik einer
 * Uebertragung: eigenes Tor unten, Angriff oben. Eine Liste zeigt dieselben
 * elf Namen, aber nicht, ob hinten drei oder fuenf stehen.
 */
export function Formationsfeld({
  shape,
  besetzung,
  gesperrt,
  onLeer,
  onSpieler,
  onEntfernen,
}: {
  shape: Record<Position, number>;
  /** Ein Eintrag je Formationsplatz, null heisst unbesetzt. */
  besetzung: Record<Position, (SquadPlayer | null)[]>;
  gesperrt: boolean;
  onLeer: (pos: Position, index: number) => void;
  onSpieler: (p: SquadPlayer, pos: Position, index: number) => void;
  onEntfernen: (pos: Position, index: number) => void;
}) {
  return (
    <View style={styles.platz}>
      {/* Rasenstreifen und Linien sind reine Zier und liegen deshalb hinten. */}
      <View style={StyleSheet.absoluteFill}>
        {Array.from({ length: 6 }, (_, i) => (
          <View
            key={i}
            style={[styles.streifen, { backgroundColor: i % 2 ? STREIFEN : RASEN }]}
          />
        ))}
        <View style={styles.mittellinie} />
        <View style={styles.mittelkreis} />
        <View style={[styles.strafraum, styles.strafraumUnten]} />
        <View style={[styles.strafraum, styles.strafraumOben]} />
      </View>

      {[...REIHEN].reverse().map((pos) => (
        <View key={pos} style={styles.reihe}>
          {Array.from({ length: shape[pos] }, (_, i) => {
            const p = besetzung[pos][i];
            return p ? (
              <Platz
                key={`${pos}-${i}`}
                p={p}
                onPress={() => onSpieler(p, pos, i)}
                onEntfernen={gesperrt ? null : () => onEntfernen(pos, i)}
              />
            ) : (
              <Leer
                key={`${pos}-${i}`}
                onPress={() => onLeer(pos, i)}
                disabled={gesperrt}
              />
            );
          })}
        </View>
      ))}
    </View>
  );
}

function Platz({
  p,
  onPress,
  onEntfernen,
}: {
  p: SquadPlayer;
  onPress: () => void;
  /** Null, solange der Spieltag laeuft - dann wird nichts mehr getauscht. */
  onEntfernen: (() => void) | null;
}) {
  // Nur der Nachname: auf einem Feld mit fuenf Spielern nebeneinander ist
  // fuer mehr kein Platz, und im Fussball reicht er ohnehin.
  const nachname = p.name.split(" ").slice(-1)[0];
  return (
    <Pressable style={styles.slot} onPress={onPress}>
      {p.photoUrl ? (
        <Image source={{ uri: p.photoUrl }} style={styles.foto} />
      ) : (
        <View style={[styles.foto, styles.fotoLeer]} />
      )}
      {onEntfernen && (
        <Pressable
          style={styles.raus}
          onPress={onEntfernen}
          hitSlop={10}
          accessibilityLabel={`${p.name} aus der Aufstellung nehmen`}
        >
          <Body style={styles.rausZeichen}>✕</Body>
        </Pressable>
      )}
      <View style={styles.schild}>
        <Body numberOfLines={1} style={styles.name}>
          {nachname}
        </Body>
      </View>
      <Body style={styles.punkte}>{p.schnitt === null ? "–" : `Ø ${p.schnitt}`}</Body>
    </Pressable>
  );
}

function Leer({ onPress, disabled }: { onPress: () => void; disabled: boolean }) {
  return (
    <Pressable style={styles.slot} onPress={onPress} disabled={disabled}>
      <View style={[styles.foto, styles.fotoOffen]}>
        <Body style={styles.plus}>＋</Body>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  platz: {
    aspectRatio: 0.78,
    borderRadius: 14,
    overflow: "hidden",
    paddingVertical: 10,
    justifyContent: "space-between",
    backgroundColor: RASEN,
  },
  streifen: { flex: 1 },
  mittellinie: {
    position: "absolute",
    top: "50%",
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: LINIE,
  },
  mittelkreis: {
    position: "absolute",
    top: "50%",
    left: "50%",
    width: 88,
    height: 88,
    marginTop: -44,
    marginLeft: -44,
    borderRadius: 44,
    borderWidth: 1,
    borderColor: LINIE,
  },
  strafraum: {
    position: "absolute",
    left: "22%",
    right: "22%",
    height: "13%",
    borderWidth: 1,
    borderColor: LINIE,
  },
  strafraumUnten: { bottom: -1 },
  strafraumOben: { top: -1 },
  reihe: {
    flexDirection: "row",
    justifyContent: "space-evenly",
    alignItems: "center",
  },
  slot: { alignItems: "center", width: 62 },
  raus: {
    position: "absolute",
    top: -2,
    right: 6,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#000000AA",
    borderWidth: 1,
    borderColor: "#FFFFFF88",
  },
  rausZeichen: { color: "#fff", fontSize: 11, lineHeight: 14, fontWeight: "700" },
  foto: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 2,
    borderColor: "#FFFFFFAA",
    backgroundColor: "#00000033",
    alignItems: "center",
    justifyContent: "center",
  },
  fotoLeer: { backgroundColor: "#00000055" },
  fotoOffen: {
    borderStyle: "dashed",
    borderColor: "#FFFFFF88",
    backgroundColor: "#00000022",
  },
  plus: { color: "#fff", fontSize: 20, fontWeight: "700", lineHeight: 22 },
  schild: {
    marginTop: 3,
    maxWidth: 62,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 5,
    backgroundColor: "#00000077",
  },
  name: { color: "#fff", fontSize: 11, lineHeight: 15, fontWeight: "600" },
  punkte: { color: "#fff", fontSize: 10, lineHeight: 14, opacity: 0.85 },
});
