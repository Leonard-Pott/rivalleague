import { View } from "react-native";
import Svg, { Circle, Line, Polygon, Polyline } from "react-native-svg";
import { Body, useColors } from "./ui";

const GRUEN = "#2E9B5B";
const ROT = "#E5484D";

type Props = {
  values: number[];
  height?: number;
  /** Nulllinie einzeichnen - sinnvoll bei Punkten, unsinnig bei Marktwerten. */
  zeroLine?: boolean;
};

/**
 * Kursverlauf als Polylinie. Bewusst ohne Chart-Bibliothek: eine Linie mit
 * Flaeche darunter sind zwanzig Zeilen, und jede Bibliothek brachte eigene
 * Layout-Eigenheiten mit.
 *
 * Gezeichnet wird in einem festen viewBox-Koordinatensystem, die Skalierung
 * uebernimmt SVG - so passt sich die Grafik jeder Bildschirmbreite an.
 */
export function Sparkline({ values, height = 90, zeroLine = false }: Props) {
  const c = useColors();

  if (values.length < 2) {
    return (
      <View style={{ height, justifyContent: "center" }}>
        <Body dim>Noch zu wenig Verlauf für eine Kurve.</Body>
      </View>
    );
  }

  const W = 300;
  const H = 100;
  const PAD = 6;

  const min = Math.min(...values, zeroLine ? 0 : Math.min(...values));
  const max = Math.max(...values, zeroLine ? 0 : Math.max(...values));
  const spanne = max - min || 1;

  const x = (i: number) => PAD + (i / (values.length - 1)) * (W - 2 * PAD);
  const y = (v: number) => H - PAD - ((v - min) / spanne) * (H - 2 * PAD);

  const punkte = values.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  const flaeche = `${x(0)},${H} ${punkte} ${x(values.length - 1)},${H}`;

  const steigt = values[values.length - 1] >= values[0];
  const farbe = steigt ? GRUEN : ROT;

  return (
    <Svg width="100%" height={height} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      <Polygon points={flaeche} fill={farbe} fillOpacity={0.14} />
      {zeroLine && min < 0 && max > 0 && (
        <Line x1={PAD} y1={y(0)} x2={W - PAD} y2={y(0)} stroke={c.textSecondary} strokeWidth={1} strokeDasharray="4 4" />
      )}
      <Polyline
        points={punkte}
        fill="none"
        stroke={farbe}
        strokeWidth={2.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      <Circle cx={x(values.length - 1)} cy={y(values[values.length - 1])} r={4} fill={farbe} />
    </Svg>
  );
}
