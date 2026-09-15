import type { Position } from "./scoring.ts";

export type Shape = Record<Position, number>;

/**
 * Erlaubte Formationen. Immer genau ein Torwart und zehn Feldspieler.
 * Die Schreibweise ist Abwehr-Mittelfeld-Angriff, wie ueberall im Fussball.
 */
export const FORMATIONS: Record<string, Shape> = {
  "3-4-3": { GK: 1, DEF: 3, MID: 4, FWD: 3 },
  "3-5-2": { GK: 1, DEF: 3, MID: 5, FWD: 2 },
  "4-3-3": { GK: 1, DEF: 4, MID: 3, FWD: 3 },
  "4-4-2": { GK: 1, DEF: 4, MID: 4, FWD: 2 },
  "4-5-1": { GK: 1, DEF: 4, MID: 5, FWD: 1 },
  "5-3-2": { GK: 1, DEF: 5, MID: 3, FWD: 2 },
  "5-4-1": { GK: 1, DEF: 5, MID: 4, FWD: 1 },
};

export const STARTERS = 11;

export type LineupPlayer = { playerId: number; position: Position };

/**
 * Prueft eine Aufstellung, bevor sie gespeichert wird.
 *
 * Gibt bewusst alle Fehler auf einmal zurueck statt beim ersten abzubrechen:
 * wer eine Aufstellung zusammenklickt, will nicht siebenmal hintereinander
 * eine neue Meldung sehen.
 */
export function validateLineup(
  formation: string,
  starters: LineupPlayer[],
  ownedPlayerIds: Set<number>,
): string[] {
  const errors: string[] = [];
  const shape = FORMATIONS[formation];

  if (!shape) {
    return [`Formation "${formation}" gibt es nicht. Moeglich: ${Object.keys(FORMATIONS).join(", ")}`];
  }

  if (starters.length !== STARTERS) {
    errors.push(`Die Startelf braucht ${STARTERS} Spieler, du hast ${starters.length}.`);
  }

  const seen = new Set<number>();
  for (const p of starters) {
    if (seen.has(p.playerId)) {
      errors.push(`Spieler ${p.playerId} steht doppelt in der Aufstellung.`);
    }
    seen.add(p.playerId);
    if (!ownedPlayerIds.has(p.playerId)) {
      errors.push(`Spieler ${p.playerId} gehoert nicht zu deinem Kader.`);
    }
  }

  const counted: Shape = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  for (const p of starters) counted[p.position]++;

  const label: Record<Position, string> = {
    GK: "Torwart",
    DEF: "Abwehr",
    MID: "Mittelfeld",
    FWD: "Angriff",
  };
  for (const pos of ["GK", "DEF", "MID", "FWD"] as Position[]) {
    if (counted[pos] !== shape[pos]) {
      errors.push(
        `${formation} braucht ${shape[pos]} in ${label[pos]}, aufgestellt sind ${counted[pos]}.`,
      );
    }
  }

  return errors;
}
