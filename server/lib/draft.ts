import type { Position } from "./scoring.ts";
import { FORMATIONS } from "./formations.ts";

/**
 * Startkader beim Liga-Beitritt. Jeder faengt mit elf Spielern an, statt vor
 * einem leeren Kader und einem vollen Markt zu sitzen - und alle fangen mit
 * derselben Summe an, damit die Liga nicht schon vor dem ersten Spieltag
 * entschieden ist.
 */
export const LOSUNG = {
  /** Gesamtwert der elf Spieler, ungefaehr. */
  gesamtwert: 100_000_000,
  /** Kein Einzelner darf die Losung dominieren. */
  maxProSpieler: 20_000_000,
  /** Gelost wird eine spielbare Elf, nicht elf zufaellige Spieler. */
  formation: "4-4-2",
};

export type Kandidat = { playerId: number; position: Position; marketValue: number };

const REIHENFOLGE: Position[] = ["GK", "DEF", "MID", "FWD"];

/** Die Plaetze der Losungsformation, von hinten nach vorn. */
export function losPlaetze(): Position[] {
  const shape = FORMATIONS[LOSUNG.formation];
  return REIHENFOLGE.flatMap((pos) => Array<Position>(shape[pos]).fill(pos));
}

/**
 * Lost elf Spieler aus dem freien Angebot.
 *
 * Der Weg ist Platz fuer Platz: was noch an Geld uebrig ist, geteilt durch die
 * noch offenen Plaetze, ergibt den Zielwert fuer diesen Platz. Aus den fuenf
 * Spielern, die diesem Wert am naechsten kommen, entscheidet der Zufall.
 *
 * Damit landet die Summe nahe am Ziel, ohne dass zwei Manager denselben Kader
 * bekommen - und ein teurer Griff am Anfang macht die spaeteren Plaetze
 * automatisch billiger.
 */
export function loseKader(
  kandidaten: Kandidat[],
  zufall: () => number = Math.random,
): Kandidat[] {
  const genommen = new Set<number>();
  const gewaehlt: Kandidat[] = [];
  const plaetze = losPlaetze();
  let rest = LOSUNG.gesamtwert;

  plaetze.forEach((pos, i) => {
    const offen = plaetze.length - i;
    const ziel = rest / offen;

    const pool = kandidaten.filter(
      (k) =>
        k.position === pos &&
        !genommen.has(k.playerId) &&
        k.marketValue <= LOSUNG.maxProSpieler,
    );
    if (pool.length === 0) return; // Position leergekauft - dann eben zehn

    const nah = [...pool]
      .sort((a, b) => Math.abs(a.marketValue - ziel) - Math.abs(b.marketValue - ziel))
      .slice(0, 5);
    const wahl = nah[Math.min(nah.length - 1, Math.floor(zufall() * nah.length))];

    gewaehlt.push(wahl);
    genommen.add(wahl.playerId);
    rest -= wahl.marketValue;
  });

  return gewaehlt;
}
