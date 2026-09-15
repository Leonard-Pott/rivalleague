export type Position = "GK" | "DEF" | "MID" | "FWD";

/**
 * Normalisierte Spielerstatistik eines Spiels. Bewusst anbieterunabhaengig -
 * die Umrechnung aus der rohen API-Antwort passiert in provider.ts, damit ein
 * Anbieterwechsel die Punkteformel nicht anfasst.
 */
export type MatchStats = {
  position: Position;
  minutes: number;
  rating: number | null;
  goals: number;
  assists: number;
  ownGoals: number;
  yellow: boolean;
  yellowRed: boolean;
  red: boolean;
  penaltyMissed: number;
  penaltySaved: number;
  /** Gegentore der Mannschaft, nicht des Spielers - fuer Abwehr und Torwart. */
  teamGoalsConceded: number;
};

/**
 * Alle Stellschrauben an einem Ort. Nach ~5 Spieltagen einmal gegen die
 * tatsaechliche Punkteverteilung nachziehen - eine Formel ohne echte Daten
 * trifft die gewuenschte Spreizung nie auf Anhieb.
 */
export const SCORING = {
  appearance: 4,
  appearance60: 6,
  goal: { GK: 18, DEF: 15, MID: 12, FWD: 10 } as Record<Position, number>,
  assist: 8,
  cleanSheet: 8,
  concededEach: -2,
  ownGoal: -8,
  yellow: -2,
  yellowRed: -5,
  red: -8,
  penaltyMissed: -7,
  penaltySaved: 10,
  /** Leistungsbonus: (rating - baseline) * factor. Erzeugt die Spreizung. */
  ratingBaseline: 6.5,
  ratingFactor: 10,
  /** Ab hier zaehlt ein Spieler als "durchgespielt". */
  fullGameMinutes: 60,
};

export function scoreMatch(s: MatchStats): number {
  if (s.minutes <= 0) return 0; // nicht eingesetzt = keine Punkte, auch kein Rating-Bonus

  const full = s.minutes >= SCORING.fullGameMinutes;
  const defensive = s.position === "GK" || s.position === "DEF";
  let points = full ? SCORING.appearance60 : SCORING.appearance;

  points += s.goals * SCORING.goal[s.position];
  points += s.assists * SCORING.assist;
  points += s.ownGoals * SCORING.ownGoal;
  points += s.penaltyMissed * SCORING.penaltyMissed;
  points += s.penaltySaved * SCORING.penaltySaved;

  if (s.yellow) points += SCORING.yellow;
  if (s.yellowRed) points += SCORING.yellowRed;
  if (s.red) points += SCORING.red;

  // Gegentore nur werten, wenn der Spieler lange genug drin war - sonst
  // kassiert ein Joker in der 85. Minute die Gegentore der ganzen Partie.
  if (defensive && full) {
    if (s.teamGoalsConceded === 0) points += SCORING.cleanSheet;
    else points += s.teamGoalsConceded * SCORING.concededEach;
  }

  if (s.rating !== null) {
    points += Math.round((s.rating - SCORING.ratingBaseline) * SCORING.ratingFactor);
  }

  return points;
}

/** Fuellt fehlende Felder auf, damit Aufrufer nur angeben was passiert ist. */
export function stats(partial: Partial<MatchStats> & { position: Position }): MatchStats {
  return {
    minutes: 0,
    rating: null,
    goals: 0,
    assists: 0,
    ownGoals: 0,
    yellow: false,
    yellowRed: false,
    red: false,
    penaltyMissed: 0,
    penaltySaved: 0,
    teamGoalsConceded: 0,
    ...partial,
  };
}
