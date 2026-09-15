import { prisma } from "@/lib/db";
import { requireManager } from "@/lib/auth";
import { handle } from "@/lib/http";
import { ensureFreeAgents, resolveMarket } from "@/lib/market-db";

type Ctx = { params: Promise<{ id: string }> };

const LIMIT = 30;

/**
 * Ein gemeinsamer Zeitstrahl aus zwei Quellen: abgeschlossene Transfers und
 * Angebote, die gerade neu auf dem Markt stehen. Getrennte Listen waeren
 * ehrlicher zur Datenbank, aber unbrauchbar - man will sehen, was seit
 * gestern passiert ist, nicht zwei Tabellen vergleichen.
 */
export const GET = handle(async (req: Request, ctx: Ctx) => {
  const { id: leagueId } = await ctx.params;
  const me = await requireManager(req, leagueId);

  // Wie im Markt: der Aufruf haelt den Markt nebenbei am Laufen.
  await resolveMarket(leagueId);
  await ensureFreeAgents(leagueId);

  const spieler = {
    select: {
      id: true,
      name: true,
      position: true,
      photoUrl: true,
      marketValue: true,
      team: { select: { id: true, name: true, logoUrl: true } },
    },
  };

  const [transfers, listings] = await Promise.all([
    prisma.transfer.findMany({
      where: { leagueId },
      orderBy: { createdAt: "desc" },
      take: LIMIT,
      include: {
        player: spieler,
        buyer: { select: { id: true, teamName: true } },
        seller: { select: { id: true, teamName: true } },
      },
    }),
    prisma.listing.findMany({
      where: { leagueId, resolvedAt: null },
      orderBy: { createdAt: "desc" },
      take: LIMIT,
      include: { player: spieler, seller: { select: { id: true, teamName: true } } },
    }),
  ]);

  const eintraege = [
    ...transfers.map((t) => ({
      id: `t:${t.id}`,
      art: "transfer" as const,
      zeit: t.createdAt,
      playerId: t.player.id,
      name: t.player.name,
      position: t.player.position,
      photoUrl: t.player.photoUrl,
      team: t.player.team,
      preis: t.price,
      kaeufer: { managerId: t.buyer.id, teamName: t.buyer.teamName },
      /** null = kam vom freien Markt, kein Mitspieler hat verdient. */
      verkaeufer: t.seller ? { managerId: t.seller.id, teamName: t.seller.teamName } : null,
      binIchBeteiligt: t.buyerId === me.id || t.sellerId === me.id,
      expiresAt: null as string | null,
    })),
    ...listings.map((l) => ({
      id: `l:${l.id}`,
      art: "angebot" as const,
      zeit: l.createdAt,
      playerId: l.player.id,
      name: l.player.name,
      position: l.player.position,
      photoUrl: l.player.photoUrl,
      team: l.player.team,
      /** Mindestgebot - immer der aktuelle Marktwert. */
      preis: l.player.marketValue,
      kaeufer: null,
      verkaeufer: l.seller ? { managerId: l.seller.id, teamName: l.seller.teamName } : null,
      binIchBeteiligt: l.sellerId === me.id,
      expiresAt: l.expiresAt.toISOString(),
    })),
  ]
    .sort((a, b) => b.zeit.getTime() - a.zeit.getTime())
    .slice(0, LIMIT)
    .map((e) => ({ ...e, zeit: e.zeit.toISOString() }));

  return { eintraege };
});
