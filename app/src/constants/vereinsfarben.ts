/**
 * Vereinsfarbe je Verein, nach der die App sich faerbt. Die Schluessel sind die
 * Vereins-IDs von API-Football, wie sie auch in der Datenbank stehen.
 *
 * Fest verdrahtet, weil beide Datenquellen keine Farben liefern und eine Farbe
 * sich seltener aendert als ein Kader. `text` steht auf der Farbe - bei Gelb
 * und Weiss muss die Schrift dunkel sein, sonst liest es niemand.
 *
 * ponytail: Farbwerte nach Augenmass aus den Vereinswappen, bei Bedarf einzeln
 * nachziehen - es ist eine Tabelle, kein Algorithmus.
 */
export type Vereinsfarbe = { farbe: string; text: string };

export const VEREINSFARBEN: Record<number, Vereinsfarbe> = {
  157: { farbe: "#DC052D", text: "#fff" }, // Bayern München
  160: { farbe: "#E2001A", text: "#fff" }, // SC Freiburg
  162: { farbe: "#1D9053", text: "#fff" }, // Werder Bremen
  163: { farbe: "#00843D", text: "#fff" }, // Borussia Mönchengladbach
  164: { farbe: "#ED1C24", text: "#fff" }, // FSV Mainz 05
  165: { farbe: "#FDE100", text: "#111" }, // Borussia Dortmund
  167: { farbe: "#1C63B7", text: "#fff" }, // 1899 Hoffenheim
  168: { farbe: "#E32219", text: "#fff" }, // Bayer Leverkusen
  169: { farbe: "#E1000F", text: "#fff" }, // Eintracht Frankfurt
  170: { farbe: "#BA3733", text: "#fff" }, // FC Augsburg
  172: { farbe: "#D20515", text: "#fff" }, // VfB Stuttgart
  173: { farbe: "#DD0741", text: "#fff" }, // RB Leipzig
  174: { farbe: "#004D9D", text: "#fff" }, // FC Schalke 04
  175: { farbe: "#0D2F6D", text: "#fff" }, // Hamburger SV
  182: { farbe: "#EB1923", text: "#fff" }, // Union Berlin
  185: { farbe: "#003A75", text: "#fff" }, // SC Paderborn 07
  192: { farbe: "#E3000F", text: "#fff" }, // 1. FC Köln
  1660: { farbe: "#A6192E", text: "#fff" }, // SV Elversberg
};

/** Ohne Lieblingsverein bleibt es beim Blau der App. */
export const STANDARDFARBE: Vereinsfarbe = { farbe: "#208AEF", text: "#fff" };

/** Wie hell eine Farbe wirkt, 0 bis 1. */
export function helligkeit(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
}

/** Mischt zwei Farben. Fuer Schrift, die auf dem Hintergrund lesbar bleiben muss. */
export function mischen(hex: string, ziel: string, anteil: number): string {
  const a = parseInt(hex.slice(1), 16);
  const b = parseInt(ziel.slice(1), 16);
  const kanal = (v: number) =>
    Math.round(((a >> v) & 255) + (((b >> v) & 255) - ((a >> v) & 255)) * anteil);
  return `#${((kanal(16) << 16) | (kanal(8) << 8) | kanal(0)).toString(16).padStart(6, "0")}`;
}
