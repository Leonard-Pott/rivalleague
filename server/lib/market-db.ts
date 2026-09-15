import { prisma } from "./db";
import {
  marktGroesse,
  zufallsLaufzeitMs,
  planTransfers,
  type ManagerState,
  type PendingListing,
} from "./market.ts";

/** Im Schnitt ein neuer freier Spieler je Stunde. */
export const NACHSCHUB_MS = 60 * 60 * 1000;

const nachschubKey = (leagueId: string) => `market:${leagueId}`;

/**
 * Fuellt den Markt mit freien Spielern auf. Braucht keinen Zeitplan: es wird
 * geprueft, wie viele Angebote offen sind, und nur die Differenz ergaenzt.
 * Damit heilt sich der Markt auch nach einem Ausfall von selbst.
 *
 * Nachgelegt wird getaktet - hoechstens ein Spieler je vergangener Stunde,
 * damit ueber den Tag verteilt etwas passiert statt einmal taeglich alles.
 * Ausnahme ist die Erstbefuellung: eine frische Liga soll sofort einen
 * vollen Markt haben.
 */
export async function ensureFreeAgents(
  leagueId: string,
  anzahl?: number,
): Promise<number> {
  const league = await prisma.league.findUnique({ where: { id: leagueId } });
  if (!league) return 0;

  // Ohne Vorgabe richtet sich die Auslage nach der Rundengroesse - ein
  // Beitritt vergroessert den Markt beim naechsten Aufruf von selbst.
  const ziel =
    anzahl ?? marktGroesse(await prisma.manager.count({ where: { leagueId } }));

  const offen = await prisma.listing.count({
    where: { leagueId, sellerId: null, resolvedAt: null },
  });
  const fehlend = ziel - offen;
  const key = nachschubKey(leagueId);
  const stand = await prisma.syncState.findUnique({ where: { key } });
  const jetzt = new Date();

  // Ein voller Markt sammelt kein Guthaben an - sonst stuenden nach einer
  // ruhigen Nacht schlagartig zehn neue Spieler da.
  if (fehlend <= 0) {
    await merkeNachschub(key, jetzt);
    return 0;
  }

  const erlaubt = stand
    ? Math.floor((jetzt.getTime() - stand.lastRunAt.getTime()) / NACHSCHUB_MS)
    : fehlend; // erste Befuellung der Liga
  const nachzulegen = Math.min(fehlend, erlaubt);
  if (nachzulegen <= 0) return 0;

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

  const auswahl = kandidaten.slice(0, nachzulegen);

  await prisma.listing.createMany({
    data: auswahl.map((p) => ({
      leagueId,
      playerId: p.id,
      sellerId: null,
      price: p.marketValue,
      expiresAt: new Date(jetzt.getTime() + zufallsLaufzeitMs()),
    })),
  });

  // Nur die verbrauchten Stunden gutschreiben, angebrochene zaehlen weiter.
  await merkeNachschub(
    key,
    stand ? new Date(stand.lastRunAt.getTime() + auswahl.length * NACHSCHUB_MS) : jetzt,
  );
  return auswahl.length;
}

async function merkeNachschub(key: string, lastRunAt: Date): Promise<void> {
  await prisma.syncState.upsert({
    where: { key },
    update: { lastRunAt },
    create: { key, lastRunAt },
  });
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
