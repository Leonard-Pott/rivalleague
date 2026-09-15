import { prisma } from "@/lib/db";
import { requireUser, HttpError } from "@/lib/auth";
import { handle } from "@/lib/http";

export const POST = handle(async (req: Request) => {
  const user = await requireUser(req);
  const { inviteCode, teamName } = (await req.json()) as {
    inviteCode?: string;
    teamName?: string;
  };
  if (!inviteCode?.trim()) throw new HttpError(400, "Einladungscode fehlt");

  const league = await prisma.league.findUnique({
    where: { inviteCode: inviteCode.trim().toUpperCase() },
  });
  if (!league) throw new HttpError(404, "Liga nicht gefunden");

  const existing = await prisma.manager.findUnique({
    where: { userId_leagueId: { userId: user.id, leagueId: league.id } },
  });
  if (existing) {
    return { leagueId: league.id, name: league.name, managerId: existing.id, alreadyMember: true };
  }

  const manager = await prisma.manager.create({
    data: {
      userId: user.id,
      leagueId: league.id,
      teamName: teamName?.trim() || user.name,
      budget: league.startBudget,
    },
  });
  return { leagueId: league.id, name: league.name, managerId: manager.id, alreadyMember: false };
});
