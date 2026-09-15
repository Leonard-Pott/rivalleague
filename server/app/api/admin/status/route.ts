import { requireAdmin } from "@/lib/admin";
import { handle } from "@/lib/http";
import { prisma } from "@/lib/db";
import { DAILY_LIMIT, usageToday } from "@/lib/provider";

export const GET = handle(async (req: Request) => {
  requireAdmin(req);

  const [teams, players, matches, leagues, syncStates, calls] = await Promise.all([
    prisma.team.count(),
    prisma.player.count(),
    prisma.match.count(),
    prisma.league.count(),
    prisma.syncState.findMany({ orderBy: { key: "asc" } }),
    usageToday(),
  ]);

  // Spieltage, deren Statistiken schon geholt wurden - Luecken hier bedeuten
  // verlorene Punkte, denn der Free-Tier laesst kein Nachladen zu.
  const synced = await prisma.match.findMany({
    where: { statsSyncedAt: { not: null } },
    distinct: ["matchday"],
    orderBy: { matchday: "asc" },
    select: { matchday: true },
  });
  const played = await prisma.match.findMany({
    where: { finished: true },
    distinct: ["matchday"],
    orderBy: { matchday: "asc" },
    select: { matchday: true },
  });

  const syncedDays = new Set(synced.map((s) => s.matchday));
  const luecken = played.map((p) => p.matchday).filter((d) => !syncedDays.has(d));

  return {
    bestand: { teams, players, matches, leagues },
    kontingent: { heute: calls, limit: DAILY_LIMIT },
    spieltage: {
      gespielt: played.map((p) => p.matchday),
      ausgewertet: [...syncedDays].sort((a, b) => a - b),
      luecken,
    },
    jobs: syncStates.map((s) => ({ key: s.key, zuletzt: s.lastRunAt })),
  };
});
