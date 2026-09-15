import { prisma } from "./db";
import { LOSUNG, loseKader, type Kandidat } from "./draft.ts";
import type { Position } from "./scoring.ts";

/**
 * Lost einem frischen Manager seine elf Spieler zu und schreibt sie in den
 * Kader. Gekauft wird zum Marktwert, damit der Gewinn bei null anfaengt -
 * sonst haette jeder am ersten Tag einen Buchgewinn aus dem Nichts.
 *
 * Das Geld beruehrt die Losung nicht: die elf sind ein Geschenk, das Budget
 * aus der Liga bleibt zum Zukaufen.
 */
export async function loseStartkader(leagueId: string, managerId: string) {
  // Frei ist, wer in dieser Liga niemandem gehoert und nicht gerade auf dem
  // Markt liegt - ein laufendes Angebot wegzulosen waere unfair gegenueber
  // dem, der schon geboten hat.
  const vergeben = await prisma.roster.findMany({
    where: { leagueId },
    select: { playerId: true },
  });
  const imAngebot = await prisma.listing.findMany({
    where: { leagueId, resolvedAt: null },
    select: { playerId: true },
  });
  const raus = new Set([
    ...vergeben.map((r) => r.playerId),
    ...imAngebot.map((l) => l.playerId),
  ]);

  const frei = await prisma.player.findMany({
    where: {
      id: { notIn: [...raus] },
      marketValue: { lte: LOSUNG.maxProSpieler, gt: 0 },
    },
    select: { id: true, position: true, marketValue: true },
  });

  const kandidaten: Kandidat[] = frei.map((p) => ({
    playerId: p.id,
    position: p.position as Position,
    marketValue: p.marketValue,
  }));

  const kader = loseKader(kandidaten);
  if (kader.length === 0) return [];

  await prisma.roster.createMany({
    data: kader.map((k) => ({
      leagueId,
      managerId,
      playerId: k.playerId,
      boughtFor: k.marketValue,
    })),
    skipDuplicates: true,
  });

  return kader;
}
