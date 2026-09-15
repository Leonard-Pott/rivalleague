import { prisma } from "@/lib/db";
import { requireManager } from "@/lib/auth";
import { HttpError } from "@/lib/guards";
import { handle } from "@/lib/http";
import { activeMatchday } from "@/lib/matchday";
import { FORMATIONS, STARTERS, validateLineup, type LineupPlayer } from "@/lib/formations";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (req: Request, ctx: Ctx) => {
  const { id: leagueId } = await ctx.params;
  const me = await requireManager(req, leagueId);
  const aktiv = await activeMatchday();

  const lineup = await prisma.lineup.findUnique({
    where: { managerId_matchday: { managerId: me.id, matchday: aktiv.matchday } },
    include: { slots: true },
  });

  // Aufstellungen aus der Zeit vor den Formationsplaetzen haben keinen Platz
  // gespeichert. Die bekommen einen von vorne durchgezaehlt - die App verteilt
  // sie dann wie frueher von links nach rechts.
  const starter = lineup?.slots.filter((s) => s.isStarter) ?? [];

  return {
    ...aktiv,
    formationen: Object.keys(FORMATIONS),
    formation: lineup?.formation ?? null,
    startelf: starter.map((s, i) => ({ playerId: s.playerId, slot: s.slot ?? i })),
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
    startelf?: { playerId: number; slot: number }[];
  };
  if (!formation || !Array.isArray(startelf)) {
    throw new HttpError(400, "formation und startelf werden erwartet");
  }
  if (startelf.length > STARTERS) throw new HttpError(400, "Zu viele Spieler");

  // Positionen kommen aus der Datenbank, nicht aus der Anfrage - sonst
  // koennte man einen Torwart als Stuermer melden und die Formation umgehen.
  const roster = await prisma.roster.findMany({
    where: { managerId: me.id },
    include: { player: { select: { id: true, position: true } } },
  });
  const positionOf = new Map(roster.map((r) => [r.player.id, r.player.position]));
  const owned = new Set(positionOf.keys());

  const aufstellung: LineupPlayer[] = startelf.map((s) => ({
    playerId: s.playerId,
    position: positionOf.get(s.playerId) ?? "FWD",
    slot: s.slot,
  }));

  const errors = validateLineup(formation, aufstellung, owned);
  if (errors.length > 0) throw new HttpError(400, errors.join(" "));

  // Ersatzbank ist alles, was nicht in der Startelf steht - so bleibt der
  // Kader vollstaendig abgebildet, auch wenn spaeter Joker-Regeln dazukommen.
  const aufgestellt = new Set(aufstellung.map((p) => p.playerId));
  const bank = roster.map((r) => r.player.id).filter((id) => !aufgestellt.has(id));

  await prisma.$transaction(async (tx) => {
    const lineup = await tx.lineup.upsert({
      where: { managerId_matchday: { managerId: me.id, matchday } },
      update: { formation },
      create: { managerId: me.id, matchday, formation },
    });
    await tx.lineupSlot.deleteMany({ where: { lineupId: lineup.id } });
    await tx.lineupSlot.createMany({
      data: [
        ...aufstellung.map((p) => ({
          lineupId: lineup.id,
          playerId: p.playerId,
          isStarter: true,
          slot: p.slot,
        })),
        ...bank.map((playerId) => ({ lineupId: lineup.id, playerId, isStarter: false })),
      ],
    });
  });

  return { matchday, formation, startelf, deadline };
});
