import { prisma } from "@/lib/db";
import { requireManager } from "@/lib/auth";
import { handle } from "@/lib/http";
import { ensureFreeAgents, resolveMarket } from "@/lib/market-db";
import { MAX_SQUAD } from "@/lib/market.ts";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (req: Request, ctx: Ctx) => {
  const { id: leagueId } = await ctx.params;
  const me = await requireManager(req, leagueId);

  // Beim Aufruf faellige Angebote abrechnen und den Markt auffuellen. Das
  // ersetzt einen Zeitplan: wer den Markt anschaut, loest ihn nebenbei aus.
  await resolveMarket(leagueId);
  await ensureFreeAgents(leagueId);

  // Die Abrechnung kann gerade eben das eigene Budget veraendert haben -
  // sonst sieht man direkt nach einem gewonnenen Gebot noch den alten Stand.
  const budget =
    (await prisma.manager.findUnique({ where: { id: me.id }, select: { budget: true } }))
      ?.budget ?? me.budget;

  const listings = await prisma.listing.findMany({
    where: { leagueId, resolvedAt: null },
    include: {
      player: {
        include: {
          team: { select: { id: true, name: true, logoUrl: true } },
          points: { orderBy: { matchday: "desc" }, take: 3 },
        },
      },
      seller: { select: { id: true, teamName: true } },
      bids: { where: { managerId: me.id } },
    },
    orderBy: [{ expiresAt: "asc" }, { price: "desc" }],
  });

  const gebundenesGeld = await prisma.bid.aggregate({
    where: { managerId: me.id, listing: { resolvedAt: null } },
    _sum: { amount: true },
  });

  const kaderGroesse = await prisma.roster.count({ where: { managerId: me.id } });

  return {
    budget,
    /** Summe aller offenen Gebote - so viel ist bereits verplant. */
    gebunden: gebundenesGeld._sum.amount ?? 0,
    kaderGroesse,
    maxKader: MAX_SQUAD,
    angebote: listings.map((l) => ({
      listingId: l.id,
      playerId: l.player.id,
      name: l.player.name,
      position: l.player.position,
      photoUrl: l.player.photoUrl,
      team: l.player.team,
      marketValue: l.player.marketValue,
      /** Mindestgebot - immer der aktuelle Marktwert. */
      price: l.player.marketValue,
      expiresAt: l.expiresAt,
      verkaeufer: l.seller ? { managerId: l.seller.id, teamName: l.seller.teamName } : null,
      istMeiner: l.sellerId === me.id,
      letztePunkte: l.player.points.map((p) => p.points),
      /** Nur das eigene Gebot ist sichtbar - alle anderen sind verdeckt. */
      meinGebot: l.bids[0]?.amount ?? null,
    })),
  };
});
