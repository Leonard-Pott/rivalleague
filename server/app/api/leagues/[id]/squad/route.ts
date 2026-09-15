import { prisma } from "@/lib/db";
import { requireManager } from "@/lib/auth";
import { handle } from "@/lib/http";
import { activeMatchday } from "@/lib/matchday";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (req: Request, ctx: Ctx) => {
  const { id: leagueId } = await ctx.params;
  const me = await requireManager(req, leagueId);
  const { matchday } = await activeMatchday();

  const roster = await prisma.roster.findMany({
    where: { managerId: me.id },
    include: {
      player: {
        include: {
          team: { select: { id: true, name: true, logoUrl: true } },
          points: { orderBy: { matchday: "desc" } },
        },
      },
    },
  });

  const lineup = await prisma.lineup.findUnique({
    where: { managerId_matchday: { managerId: me.id, matchday } },
    include: { slots: true },
  });
  const startelf = new Set(
    lineup?.slots.filter((s) => s.isStarter).map((s) => s.playerId) ?? [],
  );

  const spieler = roster.map((r) => ({
    playerId: r.player.id,
    name: r.player.name,
    position: r.player.position,
    photoUrl: r.player.photoUrl,
    team: r.player.team,
    marketValue: r.player.marketValue,
    boughtFor: r.boughtFor,
    /** Kursgewinn seit dem Kauf - die Zahl, auf die alle schauen. */
    gewinn: r.player.marketValue - r.boughtFor,
    gesamtpunkte: r.player.points.reduce((s, p) => s + p.points, 0),
    /** Schnitt je bestrittenem Spieltag - vergleichbar ueber ungleiche Einsatzzeiten. */
    schnitt: r.player.points.length
      ? Math.round(r.player.points.reduce((s, p) => s + p.points, 0) / r.player.points.length)
      : null,
    spieltage: r.player.points.length,
    letztePunkte: r.player.points[0]?.points ?? null,
    isStarter: startelf.has(r.player.id),
  }));

  return {
    matchday,
    teamName: me.teamName,
    budget: me.budget,
    teamValue: spieler.reduce((s, p) => s + p.marketValue, 0),
    kaderGroesse: spieler.length,
    spieler: spieler.sort(
      (a, b) =>
        ["GK", "DEF", "MID", "FWD"].indexOf(a.position) -
          ["GK", "DEF", "MID", "FWD"].indexOf(b.position) ||
        b.marketValue - a.marketValue,
    ),
  };
});
