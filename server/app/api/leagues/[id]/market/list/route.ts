import { prisma } from "@/lib/db";
import { requireManager } from "@/lib/auth";
import { HttpError } from "@/lib/guards";
import { handle } from "@/lib/http";
import { nextMarketClose } from "@/lib/marketclock.ts";

type Ctx = { params: Promise<{ id: string }> };

/** Eigenen Spieler auf den Markt stellen. */
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const { id: leagueId } = await ctx.params;
  const me = await requireManager(req, leagueId);

  const { playerId } = (await req.json()) as { playerId?: number };
  if (typeof playerId !== "number") throw new HttpError(400, "playerId fehlt");

  const roster = await prisma.roster.findUnique({
    where: { leagueId_playerId: { leagueId, playerId } },
    include: { player: { select: { name: true, marketValue: true } } },
  });
  if (!roster) throw new HttpError(404, "Spieler ist in dieser Liga nicht vergeben");
  if (roster.managerId !== me.id) {
    throw new HttpError(403, "Das ist nicht dein Spieler");
  }

  const bereitsDrauf = await prisma.listing.findFirst({
    where: { leagueId, playerId, resolvedAt: null },
  });
  if (bereitsDrauf) throw new HttpError(409, "Der Spieler steht schon auf dem Markt");

  const listing = await prisma.listing.create({
    data: {
      leagueId,
      playerId,
      sellerId: me.id,
      // Nur die Historie: gezahlt wird der Marktwert am Tag des Zuschlags.
      price: roster.player.marketValue,
      // Erster Stichtag. Findet sich niemand, rollt das Angebot beim
      // Abrechnen auf den naechsten - eigene Spieler liegen unbegrenzt drin.
      expiresAt: nextMarketClose(me.league.marketCloseHour),
    },
  });

  return {
    listingId: listing.id,
    name: roster.player.name,
    price: listing.price,
    expiresAt: listing.expiresAt,
  };
});

/** Eigenen Spieler wieder vom Markt nehmen, solange nicht abgerechnet wurde. */
export const DELETE = handle(async (req: Request, ctx: Ctx) => {
  const { id: leagueId } = await ctx.params;
  const me = await requireManager(req, leagueId);

  const { playerId } = (await req.json()) as { playerId?: number };
  if (typeof playerId !== "number") throw new HttpError(400, "playerId fehlt");

  const listing = await prisma.listing.findFirst({
    where: { leagueId, playerId, sellerId: me.id, resolvedAt: null },
  });
  if (!listing) throw new HttpError(404, "Kein offenes Angebot fuer diesen Spieler");
  if (listing.expiresAt.getTime() <= Date.now()) {
    throw new HttpError(409, "Marktschluss ist durch, das Angebot wird abgerechnet");
  }

  // Gebote verschwinden mit dem Angebot (onDelete: Cascade im Schema).
  await prisma.listing.delete({ where: { id: listing.id } });
  return { playerId, vomMarktGenommen: true };
});
