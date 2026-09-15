import { test } from "node:test";
import assert from "node:assert/strict";
import { FORMATIONS, STARTERS, validateLineup, type LineupPlayer } from "./formations.ts";
import type { Position } from "./scoring.ts";

/** Baut eine passende Startelf zur Formation, Spieler-IDs 1..11. */
function elf(formation: string): LineupPlayer[] {
  const shape = FORMATIONS[formation];
  const out: LineupPlayer[] = [];
  let id = 1;
  for (const pos of ["GK", "DEF", "MID", "FWD"] as Position[]) {
    for (let i = 0; i < shape[pos]; i++) out.push({ playerId: id++, position: pos });
  }
  return out;
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

test("zu wenige Spieler werden gemeldet", () => {
  const errors = validateLineup("4-4-2", elf("4-4-2").slice(0, 9), kader);
  assert.ok(errors.some((e) => e.includes("braucht 11 Spieler")));
});

test("falsche Positionsverteilung wird gemeldet", () => {
  // Elf Spieler, aber als 3-4-3 aufgestellt und als 4-4-2 gespeichert.
  const errors = validateLineup("4-4-2", elf("3-4-3"), kader);
  assert.ok(errors.some((e) => e.includes("Abwehr")));
  assert.ok(errors.some((e) => e.includes("Angriff")));
});

test("fremder Spieler wird abgelehnt", () => {
  const mitFremdem = elf("4-4-2");
  mitFremdem[5] = { playerId: 999, position: "MID" };
  const errors = validateLineup("4-4-2", mitFremdem, kader);
  assert.ok(errors.some((e) => e.includes("999") && e.includes("Kader")));
});

test("derselbe Spieler zweimal wird abgelehnt", () => {
  const doppelt = elf("4-4-2");
  doppelt[5] = { ...doppelt[4] };
  const errors = validateLineup("4-4-2", doppelt, kader);
  assert.ok(errors.some((e) => e.includes("doppelt")));
});

test("ohne Torwart geht nichts", () => {
  const ohneTw = elf("4-4-2").map((p, i) =>
    i === 0 ? { playerId: p.playerId, position: "DEF" as Position } : p,
  );
  const errors = validateLineup("4-4-2", ohneTw, kader);
  assert.ok(errors.some((e) => e.includes("Torwart")));
});

test("alle Fehler kommen auf einmal, nicht einer nach dem anderen", () => {
  const kaputt: LineupPlayer[] = [
    { playerId: 1, position: "DEF" },
    { playerId: 1, position: "DEF" },
    { playerId: 999, position: "FWD" },
  ];
  const errors = validateLineup("4-4-2", kaputt, kader);
  assert.ok(errors.length >= 4, `nur ${errors.length} Fehler: ${errors.join(" | ")}`);
});
