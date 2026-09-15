export const MAX_SQUAD = 24;

/** Freie Spieler, die je Mitspieler auf dem Markt liegen sollen. */
export const ANGEBOTE_PRO_MANAGER = 4;
/** Untergrenze, damit auch eine Liga zu zweit eine Auswahl hat. */
export const ANGEBOTE_MIN = 8;

/**
 * Wie viele freie Spieler der Markt einer Liga zeigt. Waechst mit der Runde:
 * bei acht Angeboten und sechs Mitspielern greift jeder nach denselben
 * Spielern, und wer zuletzt schaut, findet nichts mehr.
 */
export function marktGroesse(managerAnzahl: number): number {
  return Math.max(ANGEBOTE_MIN, managerAnzahl * ANGEBOTE_PRO_MANAGER);
}

/** Kuerzeste Laufzeit eines freien Angebots in Stunden. */
export const LAUFZEIT_MIN_H = 10;
/** Laengste Laufzeit. */
export const LAUFZEIT_MAX_H = 40;

/**
 * Jedes Angebot bekommt seine eigene Laufzeit. Laufen alle zur selben Minute
 * ab, schlaegt der halbe Markt auf einmal um und wer dann nicht am Handy ist,
 * verpasst die ganze Runde.
 */
export function zufallsLaufzeitMs(rnd: () => number = Math.random): number {
  const stunden = LAUFZEIT_MIN_H + rnd() * (LAUFZEIT_MAX_H - LAUFZEIT_MIN_H);
  return Math.round(stunden * 60 * 60 * 1000);
}

export type PendingBid = {
  managerId: string;
  amount: number;
  /** Millisekunden. Bei Gleichstand gewinnt das fruehere Gebot. */
  createdAt: number;
};

export type PendingListing = {
  listingId: string;
  playerId: number;
  /** null = freier Spieler vom Markt, niemand kassiert. */
  sellerId: string | null;
  /** Marktwert beim Listen, gleichzeitig Mindestgebot. */
  price: number;
  bids: PendingBid[];
};

export type ManagerState = {
  managerId: string;
  budget: number;
  squadSize: number;
};

export type Transfer = {
  listingId: string;
  playerId: number;
  sellerId: string | null;
  buyerId: string;
  price: number;
};

/**
 * Entscheidet, wer welchen Spieler bekommt. Bewusst pur und ohne Datenbank:
 * das ist die Stelle, an der Geld und Spieler den Besitzer wechseln, und
 * genau die will man testen koennen, ohne eine Liga aufzusetzen.
 *
 * Regeln:
 *  - Hoechstes Gebot gewinnt, bei Gleichstand das fruehere.
 *  - Gebote unter dem Mindestpreis zaehlen nicht.
 *  - Wer sich einen Zuschlag nicht leisten kann, wird uebersprungen; der
 *    naechsthoehere Bieter rueckt nach.
 *  - Verkaufserloese sind erst am naechsten Tag verfuegbar. Sonst haengt das
 *    Ergebnis davon ab, in welcher Reihenfolge die Angebote abgearbeitet
 *    werden - und niemand koennte nachvollziehen, warum sein Gebot verlor.
 */
export function planTransfers(
  listings: PendingListing[],
  managers: ManagerState[],
): Transfer[] {
  const state = new Map(
    managers.map((m) => [m.managerId, { budget: m.budget, squadSize: m.squadSize }]),
  );
  const transfers: Transfer[] = [];

  // Feste Reihenfolge, damit dasselbe Ergebnis reproduzierbar ist.
  const ordered = [...listings].sort((a, b) =>
    a.listingId < b.listingId ? -1 : a.listingId > b.listingId ? 1 : 0,
  );

  for (const listing of ordered) {
    const candidates = listing.bids
      .filter((b) => b.amount >= listing.price && b.managerId !== listing.sellerId)
      .sort((a, b) => b.amount - a.amount || a.createdAt - b.createdAt);

    for (const bid of candidates) {
      const buyer = state.get(bid.managerId);
      if (!buyer) continue; // Manager hat die Liga verlassen
      if (buyer.budget < bid.amount) continue;
      if (buyer.squadSize >= MAX_SQUAD) continue;

      buyer.budget -= bid.amount;
      buyer.squadSize += 1;

      if (listing.sellerId) {
        const seller = state.get(listing.sellerId);
        if (seller) seller.squadSize -= 1;
        // Der Erloes wird erst beim Anwenden gutgeschrieben, nicht hier -
        // siehe Regel oben.
      }

      transfers.push({
        listingId: listing.listingId,
        playerId: listing.playerId,
        sellerId: listing.sellerId,
        buyerId: bid.managerId,
        price: bid.amount,
      });
      break;
    }
  }

  return transfers;
}
