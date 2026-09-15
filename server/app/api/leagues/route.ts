import { prisma } from "@/lib/db";
import { requireUser, HttpError } from "@/lib/auth";
import { handle } from "@/lib/http";
import { uniqueInviteCode } from "@/lib/invite";
import { ensureFreeAgents } from "@/lib/market-db";
import { loseStartkader } from "@/lib/draft-db";
import { season } from "@/lib/sync";

export const POST = handle(async (req: Request) => {
  const user = await requireUser(req);
  const { name, teamName } = (await req.json()) as {
    name?: string;
    teamName?: string;
  };
  if (!name?.trim()) throw new HttpError(400, "Liganame fehlt");

  const league = await prisma.league.create({
    data: {
      name: name.trim(),
      season: season(),
      inviteCode: await uniqueInviteCode(),
    },
  });
  const manager = await prisma.manager.create({
    data: {
      userId: user.id,
      leagueId: league.id,
      teamName: teamName?.trim() || user.name,
      budget: league.startBudget,
    },
  });

  // Der Gruender startet wie alle anderen mit elf gelosten Spielern.
  const gelost = await loseStartkader(league.id, manager.id);

  // Erste Befuellung sofort: ein leerer Markt in einer frischen Liga sieht
  // nach einem Fehler aus, der Nachschub tropft erst danach stundenweise.
  await ensureFreeAgents(league.id);

  return {
    leagueId: league.id,
    name: league.name,
    inviteCode: league.inviteCode,
    managerId: manager.id,
    gelost: gelost.length,
  };
});
