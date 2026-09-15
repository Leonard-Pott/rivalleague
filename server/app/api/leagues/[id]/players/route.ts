import { prisma } from "@/lib/db";
import { requireManager } from "@/lib/auth";
import { handle } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

const TREFFER = 30;

/**
 * Spielersuche im Ligakontext. Ohne Suchbegriff kommen die beobachteten
 * Spieler - dafuer ist die Seite da: erst nachschauen, wen man sich gemerkt
 * hat, und dann gezielt suchen.
 *
 * Wichtig ist bei jedem Treffer, ob er noch zu haben ist. Ein Spieler, der
 * einem Mitspieler gehoert, ist keine Option, und das soll man sehen, bevor
 * man ihn anklickt.
 */
export const GET = handle(async (req: Request, ctx: Ctx) => {
  const { id: leagueId } = await ctx.params;
  const me = await requireManager(req, leagueId);

  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();

  const gemerkt = await prisma.scouting.findMany({
    where: { managerId: me.id },
    select: { playerId: true },
  });
  const gemerkteIds = new Set(gemerkt.map((s) => s.playerId));

  const players = await prisma.player.findMany({
    where: q
      ? { name: { contains: q, mode: "insensitive" } }
      : { id: { in: [...gemerkteIds] } },
    include: { team: { select: { id: true, name: true, logoUrl: true } } },
    orderBy: { marketValue: "desc" },
    take: TREFFER,
  });

  const ids = players.map((p) => p.id);
  const [roster, listings, punkte] = await Promise.all([
    prisma.roster.findMany({
      where: { leagueId, playerId: { in: ids } },
      include: { manager: { select: { id: true, teamName: true } } },
    }),
    prisma.listing.findMany({
      where: { leagueId, playerId: { in: ids }, resolvedAt: null },
      select: { playerId: true },
    }),
    prisma.playerPoints.findMany({
      where: { playerId: { in: ids } },
      select: { playerId: true, points: true },
    }),
  ]);

  const besitzerVon = new Map(roster.map((r) => [r.playerId, r.manager]));
  const imMarkt = new Set(listings.map((l) => l.playerId));
  const punkteVon = new Map<number, number[]>();
  for (const p of punkte) {
    punkteVon.set(p.playerId, [...(punkteVon.get(p.playerId) ?? []), p.points]);
  }

  return {
    suchbegriff: q,
    treffer: players.map((p) => {
      const besitzer = besitzerVon.get(p.id);
      const pl = punkteVon.get(p.id) ?? [];
      const gesamt = pl.reduce((s, x) => s + x, 0);
      return {
        playerId: p.id,
        name: p.name,
        position: p.position,
        photoUrl: p.photoUrl,
        team: p.team,
        marketValue: p.marketValue,
        gesamtpunkte: gesamt,
        spieltage: pl.length,
        schnitt: pl.length ? Math.round(gesamt / pl.length) : null,
        besitzer: besitzer
          ? {
              managerId: besitzer.id,
              teamName: besitzer.teamName,
              istMeiner: besitzer.id === me.id,
            }
          : null,
        imMarkt: imMarkt.has(p.id),
        gemerkt: gemerkteIds.has(p.id),
      };
    }),
  };
});
