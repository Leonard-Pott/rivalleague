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

const REIHENFOLGE: Position[] = ["GK", "DEF", "MID", "FWD"];

/**
 * Die elf Plaetze einer Formation, von hinten nach vorn durchnummeriert:
 * Platz 0 ist der Torwart, danach Abwehr, Mittelfeld, Angriff.
 *
 * Der Platz ist die Einheit, in der aufgestellt wird - nicht die Position.
 * Sonst rutscht der Aussenverteidiger, den jemand bewusst nach rechts
 * gestellt hat, beim naechsten Laden nach innen.
 */
export function slotPositions(formation: string): Position[] {
  const shape = FORMATIONS[formation];
  if (!shape) return [];
  return REIHENFOLGE.flatMap((pos) => Array<Position>(shape[pos]).fill(pos));
}

export type LineupPlayer = { playerId: number; position: Position; slot: number };

/**
 * Prueft eine Aufstellung, bevor sie gespeichert wird.
 *
 * Unvollstaendig ist erlaubt: gespeichert wird bei jeder Aenderung, und
 * zwischen dem ersten und dem elften Spieler ist die Aufstellung nun einmal
 * halb fertig. Wer am Spieltag Plaetze frei laesst, verschenkt Punkte - das
 * ist eine Entscheidung, kein Fehler.
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
  const plaetze = slotPositions(formation);

  if (plaetze.length === 0) {
    return [`Formation "${formation}" gibt es nicht. Moeglich: ${Object.keys(FORMATIONS).join(", ")}`];
  }

  const errors: string[] = [];

  if (starters.length > STARTERS) {
    errors.push(`Die Startelf fasst ${STARTERS} Spieler, du hast ${starters.length}.`);
  }

  const label: Record<Position, string> = {
    GK: "Torwart",
    DEF: "Abwehr",
    MID: "Mittelfeld",
    FWD: "Angriff",
  };

  const belegt = new Set<number>();
  const gesehen = new Set<number>();

  for (const p of starters) {
    if (gesehen.has(p.playerId)) {
      errors.push(`Spieler ${p.playerId} steht doppelt in der Aufstellung.`);
    }
    gesehen.add(p.playerId);

    if (!ownedPlayerIds.has(p.playerId)) {
      errors.push(`Spieler ${p.playerId} gehoert nicht zu deinem Kader.`);
    }

    if (!Number.isInteger(p.slot) || p.slot < 0 || p.slot >= plaetze.length) {
      errors.push(`Platz ${p.slot} gibt es in ${formation} nicht.`);
      continue;
    }
    if (belegt.has(p.slot)) {
      errors.push(`Platz ${p.slot} ist doppelt besetzt.`);
    }
    belegt.add(p.slot);

    if (plaetze[p.slot] !== p.position) {
      errors.push(
        `Platz ${p.slot} ist ${label[plaetze[p.slot]]}, Spieler ${p.playerId} ist ${label[p.position]}.`,
      );
    }
  }

  return errors;
}
