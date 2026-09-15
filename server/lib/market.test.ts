import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_SQUAD,
  planTransfers,
  type ManagerState,
  type PendingListing,
} from "./market.ts";

const mgr = (id: string, budget = 50_000_000, squadSize = 0): ManagerState => ({
  managerId: id,
  budget,
  squadSize,
});

const listing = (over: Partial<PendingListing> = {}): PendingListing => ({
  listingId: "L1",
  playerId: 1,
  sellerId: null,
  price: 1_000_000,
  bids: [],
  ...over,
});

test("hoechstes Gebot gewinnt", () => {
  const t = planTransfers(
    [
      listing({
        bids: [
          { managerId: "a", amount: 2_000_000, createdAt: 100 },
          { managerId: "b", amount: 3_000_000, createdAt: 200 },
        ],
      }),
    ],
    [mgr("a"), mgr("b")],
  );
  assert.equal(t.length, 1);
  assert.equal(t[0].buyerId, "b");
  assert.equal(t[0].price, 3_000_000);
});

test("bei Gleichstand gewinnt das fruehere Gebot", () => {
  const t = planTransfers(
    [
      listing({
        bids: [
          { managerId: "spaet", amount: 2_000_000, createdAt: 999 },
          { managerId: "frueh", amount: 2_000_000, createdAt: 1 },
        ],
      }),
    ],
    [mgr("spaet"), mgr("frueh")],
  );
  assert.equal(t[0].buyerId, "frueh");
});

test("Gebot unter Mindestpreis zaehlt nicht", () => {
  const t = planTransfers(
    [
      listing({
        price: 5_000_000,
        bids: [{ managerId: "a", amount: 4_999_999, createdAt: 1 }],
      }),
    ],
    [mgr("a")],
  );
  assert.deepEqual(t, []);
});

test("wer nicht zahlen kann verliert, der Naechste rueckt nach", () => {
  const t = planTransfers(
    [
      listing({
        bids: [
          { managerId: "pleite", amount: 9_000_000, createdAt: 1 },
          { managerId: "solvent", amount: 4_000_000, createdAt: 2 },
        ],
      }),
    ],
    [mgr("pleite", 1_000_000), mgr("solvent")],
  );
  assert.equal(t.length, 1);
  assert.equal(t[0].buyerId, "solvent");
  assert.equal(t[0].price, 4_000_000);
});

test("Budget deckt nicht mehrere gleichzeitige Zuschlaege", () => {
  const bids = (m: string, amount: number) => [{ managerId: m, amount, createdAt: 1 }];
  const t = planTransfers(
    [
      listing({ listingId: "L1", playerId: 1, bids: bids("a", 6_000_000) }),
      listing({ listingId: "L2", playerId: 2, bids: bids("a", 6_000_000) }),
      listing({ listingId: "L3", playerId: 3, bids: bids("a", 6_000_000) }),
    ],
    [mgr("a", 13_000_000)],
  );
  // 13 Mio reichen fuer zwei Zuschlaege, nicht fuer drei.
  assert.equal(t.length, 2);
  assert.equal(t.reduce((s, x) => s + x.price, 0), 12_000_000);
});

test("voller Kader kauft nicht mehr", () => {
  const t = planTransfers(
    [listing({ bids: [{ managerId: "a", amount: 2_000_000, createdAt: 1 }] })],
    [mgr("a", 50_000_000, MAX_SQUAD)],
  );
  assert.deepEqual(t, []);
});

test("auf eigene Spieler kann man nicht bieten", () => {
  const t = planTransfers(
    [
      listing({
        sellerId: "a",
        bids: [{ managerId: "a", amount: 9_000_000, createdAt: 1 }],
      }),
    ],
    [mgr("a")],
  );
  assert.deepEqual(t, []);
});

test("Verkaufserloes ist am selben Abend noch nicht verfuegbar", () => {
  const t = planTransfers(
    [
      // a verkauft teuer, will aber gleichzeitig teuer kaufen
      listing({ listingId: "L1", playerId: 1, sellerId: "a", price: 1_000_000,
                bids: [{ managerId: "b", amount: 20_000_000, createdAt: 1 }] }),
      listing({ listingId: "L2", playerId: 2, sellerId: null, price: 1_000_000,
                bids: [{ managerId: "a", amount: 8_000_000, createdAt: 1 }] }),
    ],
    [mgr("a", 5_000_000, 1), mgr("b", 50_000_000)],
  );
  const buyers = t.map((x) => x.buyerId);
  assert.ok(buyers.includes("b"), "b muss den Spieler von a bekommen");
  assert.ok(!buyers.includes("a"), "a darf den Erloes nicht sofort ausgeben");
});

test("ein Spieler landet in genau einem Kader", () => {
  const t = planTransfers(
    [
      listing({
        bids: [
          { managerId: "a", amount: 3_000_000, createdAt: 1 },
          { managerId: "b", amount: 3_000_000, createdAt: 2 },
          { managerId: "c", amount: 2_000_000, createdAt: 3 },
        ],
      }),
    ],
    [mgr("a"), mgr("b"), mgr("c")],
  );
  assert.equal(t.filter((x) => x.playerId === 1).length, 1);
});

test("Ergebnis haengt nicht von der Eingabereihenfolge ab", () => {
  const ls = [
    listing({ listingId: "Lb", playerId: 2, bids: [{ managerId: "a", amount: 7_000_000, createdAt: 1 }] }),
    listing({ listingId: "La", playerId: 1, bids: [{ managerId: "a", amount: 7_000_000, createdAt: 1 }] }),
  ];
  const ms = [mgr("a", 10_000_000)];
  const forward = planTransfers(ls, ms);
  const backward = planTransfers([...ls].reverse(), ms);
  assert.deepEqual(forward, backward);
  assert.equal(forward.length, 1);
});
