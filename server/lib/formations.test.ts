import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FORMATIONS,
  STARTERS,
  slotPositions,
  validateLineup,
  type LineupPlayer,
} from "./formations.ts";
import type { Position } from "./scoring.ts";

/** Baut eine passende Startelf zur Formation, Spieler-IDs 1..11. */
function elf(formation: string): LineupPlayer[] {
  return slotPositions(formation).map((position, slot) => ({
    playerId: slot + 1,
    position,
    slot,
  }));
}

const kader = new Set(Array.from({ length: 24 }, (_, i) => i + 1));

test("jede angebotene Formation ergibt genau elf Spieler", () => {
  for (const [name, shape] of Object.entries(FORMATIONS)) {
    const summe = shape.GK + shape.DEF + shape.MID + shape.FWD;
    assert.equal(summe, STARTERS, `${name} ergibt ${summe} statt ${STARTERS}`);
    assert.equal(shape.GK, 1, `${name} hat nicht genau einen Torwart`);
  }
});

test("die Formationsbezeichnung passt zu den Positionen", () => {
  for (const [name, shape] of Object.entries(FORMATIONS)) {
    const [def, mid, fwd] = name.split("-").map(Number);
    assert.deepEqual(
      [shape.DEF, shape.MID, shape.FWD],
      [def, mid, fwd],
      `${name} widerspricht sich selbst`,
    );
  }
});

test("die Plaetze stehen von hinten nach vorn", () => {
  assert.deepEqual(slotPositions("4-4-2"), [
    "GK",
    "DEF",
    "DEF",
    "DEF",
    "DEF",
    "MID",
    "MID",
    "MID",
    "MID",
    "FWD",
    "FWD",
  ]);
  assert.deepEqual(slotPositions("2-2-6"), []);
});

test("passende Aufstellung geht durch", () => {
  for (const name of Object.keys(FORMATIONS)) {
    assert.deepEqual(validateLineup(name, elf(name), kader), [], name);
  }
});

test("unbekannte Formation wird abgelehnt", () => {
  const errors = validateLineup("2-2-6", elf("4-4-2"), kader);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /gibt es nicht/);
});

/** Gespeichert wird bei jeder Aenderung - dazwischen ist die Elf nie voll. */
test("halb fertige Aufstellung ist erlaubt", () => {
  assert.deepEqual(validateLineup("4-4-2", elf("4-4-2").slice(0, 3), kader), []);
  assert.deepEqual(validateLineup("4-4-2", [], kader), []);
});

test("mehr als elf werden abgelehnt", () => {
  const zuviele = [...elf("4-4-2"), { playerId: 12, position: "FWD" as Position, slot: 10 }];
  const errors = validateLineup("4-4-2", zuviele, kader);
  assert.ok(errors.some((e) => e.includes("fasst 11")));
});

test("Spieler auf einem Platz der falschen Position wird gemeldet", () => {
  // Ein Stuermer auf Platz 1, der in 4-4-2 zur Abwehr gehoert.
  const errors = validateLineup(
    "4-4-2",
    [{ playerId: 3, position: "FWD", slot: 1 }],
    kader,
  );
  assert.ok(errors.some((e) => e.includes("Abwehr") && e.includes("Angriff")));
});

test("Platz ausserhalb der Formation wird abgelehnt", () => {
  const errors = validateLineup(
    "4-4-2",
    [{ playerId: 3, position: "FWD", slot: 11 }],
    kader,
  );
  assert.ok(errors.some((e) => e.includes("Platz 11")));
});

test("zwei Spieler auf demselben Platz werden abgelehnt", () => {
  const errors = validateLineup(
    "4-4-2",
    [
      { playerId: 2, position: "DEF", slot: 1 },
      { playerId: 3, position: "DEF", slot: 1 },
    ],
    kader,
  );
  assert.ok(errors.some((e) => e.includes("doppelt besetzt")));
});

test("fremder Spieler wird abgelehnt", () => {
  const mitFremdem = elf("4-4-2");
  mitFremdem[5] = { playerId: 999, position: "MID", slot: 5 };
  const errors = validateLineup("4-4-2", mitFremdem, kader);
  assert.ok(errors.some((e) => e.includes("999") && e.includes("Kader")));
});

test("derselbe Spieler zweimal wird abgelehnt", () => {
  const doppelt = elf("4-4-2");
  doppelt[6] = { ...doppelt[5], slot: 6 };
  const errors = validateLineup("4-4-2", doppelt, kader);
  assert.ok(errors.some((e) => e.includes("doppelt")));
});

test("alle Fehler kommen auf einmal, nicht einer nach dem anderen", () => {
  const kaputt: LineupPlayer[] = [
    { playerId: 1, position: "DEF", slot: 0 },
    { playerId: 1, position: "DEF", slot: 1 },
    { playerId: 999, position: "FWD", slot: 1 },
  ];
  const errors = validateLineup("4-4-2", kaputt, kader);
  assert.ok(errors.length >= 4, `nur ${errors.length} Fehler: ${errors.join(" | ")}`);
});
