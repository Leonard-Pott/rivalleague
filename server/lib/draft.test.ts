import { test } from "node:test";
import assert from "node:assert/strict";
import { LOSUNG, loseKader, losPlaetze, type Kandidat } from "./draft.ts";
import type { Position } from "./scoring.ts";

/** Ein Angebot wie in einer frischen Liga: je Position viele Spieler, breit gestreut. */
function angebot(): Kandidat[] {
  const out: Kandidat[] = [];
  let id = 1;
  for (const position of ["GK", "DEF", "MID", "FWD"] as Position[]) {
    for (let i = 0; i < 40; i++) {
      out.push({ playerId: id++, position, marketValue: 500_000 + i * 900_000 });
    }
  }
  return out;
}

/** Wuerfel mit fester Folge - damit ist ein Fehlschlag nachstellbar. */
function wuerfel(start = 1): () => number {
  let n = start;
  return () => {
    n = (n * 1103515245 + 12345) % 2147483648;
    return n / 2147483648;
  };
}

test("die Losung ergibt eine spielbare Elf", () => {
  const kader = loseKader(angebot(), wuerfel());
  assert.equal(kader.length, 11);

  const positionen = kader.map((k) => k.position);
  assert.deepEqual([...positionen].sort(), [...losPlaetze()].sort());
});

test("kein Spieler ist teurer als erlaubt", () => {
  for (let lauf = 1; lauf <= 20; lauf++) {
    for (const k of loseKader(angebot(), wuerfel(lauf))) {
      assert.ok(
        k.marketValue <= LOSUNG.maxProSpieler,
        `${k.playerId} kostet ${k.marketValue}`,
      );
    }
  }
});

test("die Summe liegt nah am Zielwert", () => {
  for (let lauf = 1; lauf <= 20; lauf++) {
    const summe = loseKader(angebot(), wuerfel(lauf)).reduce(
      (s, k) => s + k.marketValue,
      0,
    );
    const abweichung = Math.abs(summe - LOSUNG.gesamtwert) / LOSUNG.gesamtwert;
    assert.ok(abweichung < 0.15, `${summe} weicht um ${Math.round(abweichung * 100)}% ab`);
  }
});

test("niemand wird doppelt gelost", () => {
  const kader = loseKader(angebot(), wuerfel(7));
  assert.equal(new Set(kader.map((k) => k.playerId)).size, kader.length);
});

test("zwei Manager bekommen nicht denselben Kader", () => {
  const a = loseKader(angebot(), wuerfel(1)).map((k) => k.playerId);
  const b = loseKader(angebot(), wuerfel(2)).map((k) => k.playerId);
  assert.notDeepEqual(a, b);
});

test("ein leergekaufter Markt fuehrt nicht zum Absturz", () => {
  // Nur Torhueter im Angebot: die Losung gibt zurueck, was sie findet.
  const nurTor = angebot().filter((k) => k.position === "GK");
  const kader = loseKader(nurTor, wuerfel());
  assert.equal(kader.length, 1);
});

test("zu teure Spieler werden uebergangen", () => {
  const teuer = angebot().map((k) => ({ ...k, marketValue: 25_000_000 }));
  assert.deepEqual(loseKader(teuer, wuerfel()), []);
});
