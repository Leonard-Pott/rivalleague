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
  onPlatz,
}: {
  shape: Record<Position, number>;
  /** Ein Eintrag je Formationsplatz, null heisst unbesetzt. */
  besetzung: Record<Position, (SquadPlayer | null)[]>;
  gesperrt: boolean;
  /** Ein Platz wird angetippt - besetzt oder nicht, es geht immer um denselben Platz. */
  onPlatz: (pos: Position, index: number) => void;
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
                onPress={() => onPlatz(pos, i)}
                disabled={gesperrt}
              />
            ) : (
              <Leer
                key={`${pos}-${i}`}
                onPress={() => onPlatz(pos, i)}
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
  disabled,
}: {
  p: SquadPlayer;
  onPress: () => void;
  disabled: boolean;
}) {
  // Nur der Nachname: auf einem Feld mit fuenf Spielern nebeneinander ist
  // fuer mehr kein Platz, und im Fussball reicht er ohnehin.
  const nachname = p.name.split(" ").slice(-1)[0];
  return (
    <Pressable style={styles.slot} onPress={onPress} disabled={disabled}>
      {p.photoUrl ? (
        <Image source={{ uri: p.photoUrl }} style={styles.foto} />
      ) : (
        <View style={[styles.foto, styles.fotoLeer]} />
      )}
      {/* Haengt unter dem Kreis, ohne ihn zu verschieben: sonst rutscht eine
          besetzte Reihe nach oben und das Feld steht schief. */}
      <View style={styles.schild} pointerEvents="none">
        <Body numberOfLines={1} style={styles.name}>
          {nachname}
        </Body>
        {p.schnitt !== null && <Body style={styles.punkte}>Ø {p.schnitt}</Body>}
      </View>
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
    // Unten mehr Luft: der Name haengt unter dem Kreis, und der Torwart steht
    // am Rand - ohne den Platz waere sein Name abgeschnitten.
    paddingTop: 12,
    paddingBottom: 36,
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
  // Die Hoehe ist der Kreis, nicht der Kreis samt Namen - ein besetzter Platz
  // muss genauso hoch sein wie ein leerer, sonst springt die Reihe.
  slot: { alignItems: "center", width: 62, height: 42 },
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
  schild: { position: "absolute", top: 45, left: -4, right: -4, alignItems: "center" },
  // Schatten statt Plakette: auf dem Rasen liest sich der Name auch so, und
  // der Platz bleibt so ruhig wie ein leerer.
  name: {
    color: "#fff",
    // Breiter als der Platz, aber nicht bis zum Nachbarn: fuenf Abwehrspieler
    // nebeneinander haben keine 70 Pixel fuer "Schlotterbeck".
    maxWidth: 74,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "600",
    textShadowColor: "#000000CC",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  punkte: {
    color: "#fff",
    fontSize: 10,
    lineHeight: 13,
    opacity: 0.9,
    textShadowColor: "#000000CC",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
});
