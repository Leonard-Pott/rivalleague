import { prisma } from "@/lib/db";
import { requireManager } from "@/lib/auth";
import { HttpError } from "@/lib/guards";
import { handle } from "@/lib/http";
import { activeMatchday } from "@/lib/matchday";
import { FORMATIONS, validateLineup, type LineupPlayer } from "@/lib/formations";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (req: Request, ctx: Ctx) => {
  const { id: leagueId } = await ctx.params;
  const me = await requireManager(req, leagueId);
  const aktiv = await activeMatchday();

  const lineup = await prisma.lineup.findUnique({
    where: { managerId_matchday: { managerId: me.id, matchday: aktiv.matchday } },
    include: { slots: true },
  });

  return {
    ...aktiv,
    formationen: Object.keys(FORMATIONS),
    formation: lineup?.formation ?? null,
    startelf: lineup?.slots.filter((s) => s.isStarter).map((s) => s.playerId) ?? [],
  };
});

export const PUT = handle(async (req: Request, ctx: Ctx) => {
  const { id: leagueId } = await ctx.params;
  const me = await requireManager(req, leagueId);
  const { matchday, locked, deadline } = await activeMatchday();

  if (locked) {
    throw new HttpError(
      409,
      `Spieltag ${matchday} laeuft bereits, die Aufstellung ist eingefroren.`,
    );
  }

  const { formation, startelf } = (await req.json()) as {
    formation?: string;
    startelf?: number[];
  };
  if (!formation || !Array.isArray(startelf)) {
    throw new HttpError(400, "formation und startelf werden erwartet");
  }

  // Positionen kommen aus der Datenbank, nicht aus der Anfrage - sonst
  // koennte man einen Torwart als Stuermer melden und die Formation umgehen.
  const roster = await prisma.roster.findMany({
    where: { managerId: me.id },
    include: { player: { select: { id: true, position: true } } },
  });
  const positionOf = new Map(roster.map((r) => [r.player.id, r.player.position]));
  const owned = new Set(positionOf.keys());

  const aufstellung: LineupPlayer[] = startelf.map((playerId) => ({
    playerId,
    position: positionOf.get(playerId) ?? "FWD",
  }));

  const errors = validateLineup(formation, aufstellung, owned);
  if (errors.length > 0) throw new HttpError(400, errors.join(" "));

  // Ersatzbank ist alles, was nicht in der Startelf steht - so bleibt der
  // Kader vollstaendig abgebildet, auch wenn spaeter Joker-Regeln dazukommen.
  const bank = roster
    .map((r) => r.player.id)
    .filter((id) => !startelf.includes(id));

  await prisma.$transaction(async (tx) => {
    const lineup = await tx.lineup.upsert({
      where: { managerId_matchday: { managerId: me.id, matchday } },
      update: { formation },
      create: { managerId: me.id, matchday, formation },
    });
    await tx.lineupSlot.deleteMany({ where: { lineupId: lineup.id } });
    await tx.lineupSlot.createMany({
      data: [
        ...startelf.map((playerId) => ({ lineupId: lineup.id, playerId, isStarter: true })),
        ...bank.map((playerId) => ({ lineupId: lineup.id, playerId, isStarter: false })),
      ],
    });
  });

  return { matchday, formation, startelf, deadline };
});
