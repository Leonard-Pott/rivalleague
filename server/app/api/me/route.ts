import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { handle } from "@/lib/http";

export const GET = handle(async (req: Request) => {
  const user = await requireUser(req);
  const managers = await prisma.manager.findMany({
    where: { userId: user.id },
    include: { league: { select: { id: true, name: true, inviteCode: true } } },
    orderBy: { createdAt: "asc" },
  });
  return {
    user: { id: user.id, name: user.name, image: user.image },
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
