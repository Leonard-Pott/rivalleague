import type { Position } from "./scoring.ts";

/**
 * Alle Stellschrauben an einem Ort. Die Kurve ist eine Schaetzung - nach ein
 * paar Spieltagen gegen die echte Punkteverteilung nachziehen.
 */
export const MV = {
  min: 500_000,
  max: 25_000_000,
  /** Deckel pro Tag. Ohne ihn sprengt ein einzelner Ausreisser-Spieltag den Markt. */
  maxDailyChange: 0.05,
  /** Punkte-Delta -> relative Wertaenderung. */
  k: 0.003,
  /** Erwartete Punkte pro Spieltag: teure Spieler muessen mehr liefern. */
  expectedDivisor: 800_000,
  /** Wie viele Spieltage in die Form einfliessen. */
  formWindow: 3,
};

export function expectedPoints(marketValue: number): number {
  return marketValue / MV.expectedDivisor;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/**
 * Taegliche Anpassung. `recentPoints` sind die Punkte der letzten Spieltage,
 * neueste zuerst; nicht gespielte Spieltage zaehlen als 0 - genau deshalb
 * verliert ein Dauerreservist an Wert.
 */
export function nextMarketValue(current: number, recentPoints: number[]): number {
  const window = recentPoints.slice(0, MV.formWindow);
  if (window.length === 0) return current; // vor dem ersten Spieltag passiert nichts

  const avg = window.reduce((a, b) => a + b, 0) / window.length;
  const delta = avg - expectedPoints(current);
  const change = clamp(MV.k * delta, -MV.maxDailyChange, MV.maxDailyChange);

  return Math.round(clamp(current * (1 + change), MV.min, MV.max));
}

/** Kalibrierung der Startwerte, getrennt von der Tagesanpassung. */
export const SEED = {
  /** Ab hier zaehlt Spielzeit als "durchgespielt" (~27 volle Spiele). */
  minutesFull: 2400,
  /**
   * Bundesliga-Bewertungen liegen fast alle zwischen 6,3 und 7,6. Ein
   * breiteres Band macht die Skala oben flach: dann erreicht jeder
   * Stammspieler die Bestnote und ein Linksverteidiger ist so teuer wie Kane.
   */
  ratingFloor: 6.3,
  ratingCeil: 7.6,
  /** Torbeteiligungen fuer den Vollwert - Abwehr braucht weniger. */
  contributionScale: { defensive: 8, offensive: 20 },
  weights: { playingTime: 0.35, quality: 0.4, contribution: 0.25 },
  /** Zweitliga-Leistungen sind weniger wert als dieselbe Zahl in Liga eins. */
  lowerTierFactor: 0.75,
};

export type SeasonStats = {
  position: Position;
  minutes: number;
  /** Durchschnittsbewertung der Vorsaison, null wenn der Spieler neu ist. */
  rating: number | null;
  goals: number;
  assists: number;
  /** Wurden diese Zahlen in der Bundesliga erzielt oder eine Klasse tiefer? */
  topTier?: boolean;
};

/**
 * Startmarktwert aus den Vorsaison-Statistiken. Ohne sinnvolle Startwerte
 * waere der Transfermarkt witzlos, weil jeder Spieler gleich teuer waere.
 *
 * Die Kurve ist bewusst exponentiell, nicht linear: echte Marktwerte sind
 * stark rechtsschief - viele Spieler im unteren Bereich, wenige Ausreisser
 * oben. Linear interpoliert landet der Durchschnittsprofi bei der Haelfte des
 * Hoechstwerts, und der ganze Markt fuehlt sich gleich teuer an.
 */
export function initialMarketValue(s: SeasonStats): number {
  const playingTime = clamp(s.minutes / SEED.minutesFull, 0, 1);
  const quality =
    s.rating === null
      ? 0
      : clamp((s.rating - SEED.ratingFloor) / (SEED.ratingCeil - SEED.ratingFloor), 0, 1);

  const defensive = s.position === "GK" || s.position === "DEF";
  const scale = defensive ? SEED.contributionScale.defensive : SEED.contributionScale.offensive;
  const contribution = clamp((s.goals + s.assists) / scale, 0, 1);

  let score =
    playingTime * SEED.weights.playingTime +
    quality * SEED.weights.quality +
    contribution * SEED.weights.contribution;

  if (s.topTier === false) score *= SEED.lowerTierFactor;

  return Math.round(MV.min * Math.pow(MV.max / MV.min, clamp(score, 0, 1)));
}
