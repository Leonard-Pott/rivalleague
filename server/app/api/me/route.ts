import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { HttpError } from "@/lib/guards";
import { handle } from "@/lib/http";

export const GET = handle(async (req: Request) => {
  const user = await requireUser(req);
  // Wappen und Name gleich mit: die Kopfzeile zeigt beides, sonst braeuchte
  // sie einen zweiten Aufruf fuer eine Zeile.
  const favoriteTeam = user.favoriteTeamId
    ? await prisma.team.findUnique({
        where: { id: user.favoriteTeamId },
        select: { id: true, name: true, logoUrl: true },
      })
    : null;
  const managers = await prisma.manager.findMany({
    where: { userId: user.id },
    include: { league: { select: { id: true, name: true, inviteCode: true } } },
    orderBy: { createdAt: "asc" },
  });
  return {
    user: {
      id: user.id,
      name: user.name,
      image: user.image,
      /** Faerbt die App. Null heisst: noch nicht gewaehlt, die App fragt danach. */
      favoriteTeam,
    },
    leagues: managers.map((m) => ({
      leagueId: m.league.id,
      name: m.league.name,
      inviteCode: m.league.inviteCode,
      managerId: m.id,
      teamName: m.teamName,
      budget: m.budget,
    })),
  };
});

/** Lieblingsverein setzen oder wechseln. Mehr gibt es am Profil nicht zu aendern. */
export const PATCH = handle(async (req: Request) => {
  const user = await requireUser(req);
  const { favoriteTeamId } = (await req.json()) as { favoriteTeamId?: number | null };

  if (favoriteTeamId !== null && !Number.isInteger(favoriteTeamId)) {
    throw new HttpError(400, "favoriteTeamId fehlt");
  }
  if (favoriteTeamId !== null) {
    const team = await prisma.team.findUnique({ where: { id: favoriteTeamId } });
    if (!team) throw new HttpError(404, "Verein nicht gefunden");
  }

  await prisma.user.update({ where: { id: user.id }, data: { favoriteTeamId } });
  return { favoriteTeamId };
});
