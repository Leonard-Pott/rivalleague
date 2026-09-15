import { prisma } from "@/lib/db";
import { requireManager } from "@/lib/auth";
import { HttpError } from "@/lib/guards";
import { handle } from "@/lib/http";

type Ctx = { params: Promise<{ id: string; managerId: string }> };

/**
 * Der Kader eines Mitspielers. Wer in der Tabelle sieht, dass jemand vorne
 * steht, will wissen, womit - und alles hier ist ohnehin oeffentlich: die
 * Spieler laufen sonntags im Fernsehen.
 */
export const GET = handle(async (req: Request, ctx: Ctx) => {
  const { id: leagueId, managerId } = await ctx.params;
  await requireManager(req, leagueId);

  const manager = await prisma.manager.findFirst({
    where: { id: managerId, leagueId },
    include: {
      user: { select: { name: true } },
      roster: {
        include: {
          player: {
            include: {
              team: { select: { id: true, name: true, logoUrl: true } },
              points: { orderBy: { matchday: "desc" } },
            },
          },
        },
      },
      points: true,
    },
  });
  if (!manager) throw new HttpError(404, "Manager nicht gefunden");

  const spieler = manager.roster
    .map((r) => ({
      playerId: r.player.id,
      name: r.player.name,
      position: r.player.position,
      photoUrl: r.player.photoUrl,
      team: r.player.team,
      marketValue: r.player.marketValue,
      gesamtpunkte: r.player.points.reduce((s, p) => s + p.points, 0),
      spieltage: r.player.points.length,
      schnitt: r.player.points.length
        ? Math.round(
            r.player.points.reduce((s, p) => s + p.points, 0) / r.player.points.length,
          )
        : null,
    }))
    .sort(
      (a, b) =>
        ["GK", "DEF", "MID", "FWD"].indexOf(a.position) -
          ["GK", "DEF", "MID", "FWD"].indexOf(b.position) ||
        b.marketValue - a.marketValue,
    );

  return {
    managerId: manager.id,
    teamName: manager.teamName,
    managerName: manager.user.name,
    budget: manager.budget,
    teamValue: spieler.reduce((s, p) => s + p.marketValue, 0),
    gesamtpunkte: manager.points.reduce((s, p) => s + p.points, 0),
    spieler,
  };
});
