import { prisma } from "./db";
import { nextMarketClose } from "./marketclock.ts";
import { planTransfers, type ManagerState, type PendingListing } from "./market.ts";

/** So viele freie Spieler stehen gleichzeitig auf dem Markt. */
export const FREIE_SPIELER = 8;

/**
 * Fuellt den Markt mit freien Spielern auf. Braucht keinen Zeitplan: es wird
 * geprueft, wie viele Angebote offen sind, und nur die Differenz ergaenzt.
 * Damit heilt sich der Markt auch nach einem Ausfall von selbst.
 */
export async function ensureFreeAgents(
  leagueId: string,
  anzahl = FREIE_SPIELER,
): Promise<number> {
  const league = await prisma.league.findUnique({ where: { id: leagueId } });
  if (!league) return 0;

  const offen = await prisma.listing.count({
    where: { leagueId, sellerId: null, resolvedAt: null },
  });
  const fehlend = anzahl - offen;
  if (fehlend <= 0) return 0;

  // Weder im Kader eines Managers noch bereits auf dem Markt.
  const kandidaten = await prisma.player.findMany({
    where: {
      rosters: { none: { leagueId } },
      listings: { none: { leagueId, resolvedAt: null } },
    },
    select: { id: true, marketValue: true },
  });
  if (kandidaten.length === 0) return 0;

  // Zufaellige Auswahl, damit nicht jede Liga dieselben Spieler sieht.
  for (let i = kandidaten.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [kandidaten[i], kandidaten[j]] = [kandidaten[j], kandidaten[i]];
  }

  const expiresAt = nextMarketClose(league.marketCloseHour);
  const auswahl = kandidaten.slice(0, fehlend);

  await prisma.listing.createMany({
    data: auswahl.map((p) => ({
      leagueId,
      playerId: p.id,
      sellerId: null,
      price: p.marketValue,
      expiresAt,
    })),
  });
  return auswahl.length;
}

export type ResolveResult = {
  aufgeloest: number;
  transfers: { playerId: number; buyerId: string; sellerId: string | null; price: number }[];
};

/**
 * Loest alle abgelaufenen Angebote einer Liga auf.
 *
 * Die Entscheidung faellt in planTransfers (rein und getestet), hier wird sie
 * nur angewendet - und zwar komplett in einer Transaktion. Ein halb
 * aufgeloester Markt, bei dem Geld abgebucht aber kein Spieler uebertragen
 * wurde, ist der eine Fehler, der eine Freundesliga wirklich zerlegt.
 */
export async function resolveMarket(leagueId: string): Promise<ResolveResult> {
  const faellig = await prisma.listing.findMany({
    where: { leagueId, resolvedAt: null, expiresAt: { lte: new Date() } },
    include: { bids: true },
  });
  if (faellig.length === 0) return { aufgeloest: 0, transfers: [] };

  const managers = await prisma.manager.findMany({
    where: { leagueId },
    select: { id: true, budget: true, _count: { select: { roster: true } } },
  });

  const zustand: ManagerState[] = managers.map((m) => ({
    managerId: m.id,
    budget: m.budget,
    squadSize: m._count.roster,
  }));

  const angebote: PendingListing[] = faellig.map((l) => ({
    listingId: l.id,
    playerId: l.playerId,
    sellerId: l.sellerId,
    price: l.price,
    bids: l.bids.map((b) => ({
      managerId: b.managerId,
      amount: b.amount,
      createdAt: b.createdAt.getTime(),
    })),
  }));

  const transfers = planTransfers(angebote, zustand);
  const jetzt = new Date();

  await prisma.$transaction(async (tx) => {
    for (const t of transfers) {
      await tx.manager.update({
        where: { id: t.buyerId },
        data: { budget: { decrement: t.price } },
      });

      if (t.sellerId) {
        await tx.manager.update({
          where: { id: t.sellerId },
          data: { budget: { increment: t.price } },
        });
        await tx.roster.update({
          where: { leagueId_playerId: { leagueId, playerId: t.playerId } },
          data: { managerId: t.buyerId, boughtFor: t.price, boughtAt: jetzt },
        });
        // Der verkaufte Spieler darf nicht in der Aufstellung des Verkaeufers
        // stehenbleiben - sonst kassierte der Verkaeufer weiter dessen Punkte.
        await tx.lineupSlot.deleteMany({
          where: { playerId: t.playerId, lineup: { managerId: t.sellerId } },
        });
      } else {
        await tx.roster.create({
          data: {
            managerId: t.buyerId,
            leagueId,
            playerId: t.playerId,
            boughtFor: t.price,
            boughtAt: jetzt,
          },
        });
      }
    }

    // Historie: der Roster-Eintrag kennt spaeter nur noch den letzten Besitzer.
    await tx.transfer.createMany({
      data: transfers.map((t) => ({
        leagueId,
        playerId: t.playerId,
        buyerId: t.buyerId,
        sellerId: t.sellerId,
        price: t.price,
        createdAt: jetzt,
      })),
    });

    // Auch Angebote ohne Gewinner werden geschlossen, sonst haengen sie ewig.
    await tx.listing.updateMany({
      where: { id: { in: faellig.map((l) => l.id) } },
      data: { resolvedAt: jetzt },
    });
  });

  return {
    aufgeloest: faellig.length,
    transfers: transfers.map((t) => ({
      playerId: t.playerId,
      buyerId: t.buyerId,
      sellerId: t.sellerId,
      price: t.price,
    })),
  };
}
