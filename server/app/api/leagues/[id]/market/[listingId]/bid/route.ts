import { prisma } from "@/lib/db";
import { requireManager } from "@/lib/auth";
import { HttpError } from "@/lib/guards";
import { handle } from "@/lib/http";
import { MAX_SQUAD } from "@/lib/market.ts";

type Ctx = { params: Promise<{ id: string; listingId: string }> };

/** Gebot abgeben oder aendern. Bis zum Marktschluss beliebig oft. */
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const { id: leagueId, listingId } = await ctx.params;
  const me = await requireManager(req, leagueId);

  const { amount } = (await req.json()) as { amount?: number };
  if (typeof amount !== "number" || !Number.isFinite(amount)) {
    throw new HttpError(400, "amount fehlt");
  }
  const gebot = Math.round(amount);

  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    include: { player: { select: { marketValue: true } } },
  });
  if (!listing || listing.leagueId !== leagueId) {
    throw new HttpError(404, "Angebot gibt es nicht");
  }
  if (listing.resolvedAt) throw new HttpError(409, "Angebot ist bereits abgerechnet");
  if (listing.expiresAt.getTime() <= Date.now()) {
    throw new HttpError(409, "Marktschluss ist durch");
  }
  if (listing.sellerId === me.id) {
    throw new HttpError(400, "Auf eigene Spieler kann man nicht bieten");
  }
  // Nicht der Preis beim Einstellen zaehlt, sondern der Marktwert von heute -
  // ein Angebot kann wochenlang liegen, der Kurs laeuft derweil weiter.
  const mindestens = listing.player.marketValue;
  if (gebot < mindestens) {
    throw new HttpError(400, `Mindestgebot sind ${mindestens.toLocaleString("de-DE")} Euro`);
  }

  const kaderGroesse = await prisma.roster.count({ where: { managerId: me.id } });
  if (kaderGroesse >= MAX_SQUAD) {
    throw new HttpError(400, `Dein Kader ist mit ${MAX_SQUAD} Spielern voll`);
  }

  // Alle offenen Gebote zusammen duerfen das Budget nicht sprengen. Sonst
  // koennte man auf zwanzig Spieler bieten und beim Zuschlag nicht zahlen -
  // die Aufloesung wuerde die ueberzaehligen zwar verwerfen, aber der Bieter
  // erfuehre erst am naechsten Morgen davon.
  const andere = await prisma.bid.aggregate({
    where: {
      managerId: me.id,
      listing: { resolvedAt: null },
      listingId: { not: listingId },
    },
    _sum: { amount: true },
  });
  const gesamt = (andere._sum.amount ?? 0) + gebot;
  if (gesamt > me.budget) {
    throw new HttpError(
      400,
      `Deine offenen Gebote lägen bei ${gesamt.toLocaleString("de-DE")} Euro, dein Budget ist ${me.budget.toLocaleString("de-DE")} Euro.`,
    );
  }

  await prisma.bid.upsert({
    where: { listingId_managerId: { listingId, managerId: me.id } },
    update: { amount: gebot, createdAt: new Date() },
    create: { listingId, managerId: me.id, amount: gebot },
  });

  return { listingId, meinGebot: gebot, gebundenGesamt: gesamt };
});

/** Gebot zurueckziehen. */
export const DELETE = handle(async (req: Request, ctx: Ctx) => {
  const { id: leagueId, listingId } = await ctx.params;
  const me = await requireManager(req, leagueId);

  const listing = await prisma.listing.findUnique({ where: { id: listingId } });
  if (!listing || listing.leagueId !== leagueId) {
    throw new HttpError(404, "Angebot gibt es nicht");
  }
  if (listing.resolvedAt || listing.expiresAt.getTime() <= Date.now()) {
    throw new HttpError(409, "Marktschluss ist durch");
  }

  await prisma.bid.deleteMany({ where: { listingId, managerId: me.id } });
  return { listingId, meinGebot: null };
});
