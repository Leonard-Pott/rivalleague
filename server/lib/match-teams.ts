/**
 * Verbindet die Vereinsnamen der beiden Datenquellen. Rein und ohne Netz,
 * damit der Abgleich testbar bleibt: sobald ein Aufsteiger dazukommt, ist das
 * die Stelle, die still das Falsche tun koennte.
 */

/** Vereinskuerzel und Rechtsformen, die je nach Quelle mal da sind und mal nicht. */
const NOISE = /\b(fc|sv|vfb|vfl|tsg|sc|bv|spvgg|ev|1|04|05|07|09|1899|1846|1900)\b/g;

export function normalize(name: string): string {
  const withoutUmlauts = name
    .replace(/ß/g, "ss")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "");
  return withoutUmlauts
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(NOISE, " ")
    .split(/\s+/)
    .filter(Boolean)
    .join(" ");
}

function bigrams(s: string): string[] {
  const padded = ` ${s} `;
  return Array.from({ length: padded.length - 1 }, (_, i) => padded.slice(i, i + 2));
}

/** Dice-Koeffizient auf Bigrammen: 1 = identisch, 0 = nichts gemeinsam. */
export function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a || !b) return 0;

  const left = bigrams(a);
  const right = new Map<string, number>();
  for (const g of bigrams(b)) right.set(g, (right.get(g) ?? 0) + 1);

  let hits = 0;
  for (const g of left) {
    const count = right.get(g) ?? 0;
    if (count > 0) {
      hits++;
      right.set(g, count - 1);
    }
  }
  return (2 * hits) / (left.length + bigrams(b).length);
}

export type NamedTeam = { id: number; name: string };
export type TeamMatch = {
  openligaId: number;
  openligaName: string;
  teamId: number;
  teamName: string;
  score: number;
};

/** Ab hier gilt eine Zuordnung als sicher. Darunter lieber melden als raten. */
export const MATCH_THRESHOLD = 0.8;

/**
 * Ordnet jedem OpenLigaDB-Verein genau einen API-Football-Verein zu.
 * Einmal vergebene Vereine fallen raus, damit nicht zwei Klubs auf denselben
 * Eintrag zeigen - das waere ein stiller Datenfehler, der erst beim
 * Punktezaehlen auffiele.
 */
export function matchTeams(
  openliga: { teamId: number; teamName: string }[],
  candidates: NamedTeam[],
): { matched: TeamMatch[]; unmatched: { openligaId: number; openligaName: string }[] } {
  const pool = candidates.map((c) => ({ ...c, norm: normalize(c.name) }));
  const taken = new Set<number>();
  const matched: TeamMatch[] = [];
  const unmatched: { openligaId: number; openligaName: string }[] = [];

  // Beste Treffer zuerst vergeben, damit ein eindeutiger Verein nicht von
  // einem knappen Konkurrenten weggeschnappt wird.
  const scored = openliga.map((team) => {
    const norm = normalize(team.teamName);
    let best: (typeof pool)[number] | null = null;
    let bestScore = -1;
    for (const cand of pool) {
      const score = similarity(norm, cand.norm);
      if (score > bestScore) {
        bestScore = score;
        best = cand;
      }
    }
    return { team, best, bestScore, norm };
  });
  scored.sort((a, b) => b.bestScore - a.bestScore);

  for (const { team, norm } of scored) {
    let best: (typeof pool)[number] | null = null;
    let bestScore = -1;
    for (const cand of pool) {
      if (taken.has(cand.id)) continue;
      const score = similarity(norm, cand.norm);
      if (score > bestScore) {
        bestScore = score;
        best = cand;
      }
    }

    if (best && bestScore >= MATCH_THRESHOLD) {
      taken.add(best.id);
      matched.push({
        openligaId: team.teamId,
        openligaName: team.teamName,
        teamId: best.id,
        teamName: best.name,
        score: Number(bestScore.toFixed(3)),
      });
    } else {
      unmatched.push({ openligaId: team.teamId, openligaName: team.teamName });
    }
  }

  return { matched, unmatched };
}
