import { test } from "node:test";
import assert from "node:assert/strict";
import { scoreMatch, stats, SCORING } from "./scoring.ts";

test("Stuermer mit Doppelpack landet deutlich im Plus", () => {
  const p = scoreMatch(
    stats({ position: "FWD", minutes: 90, goals: 2, rating: 8.4 }),
  );
  // 6 (Einsatz 60+) + 2*10 (Tore) + round((8.4-6.5)*10) = 6 + 20 + 19
  assert.equal(p, 45);
});

test("Torwart mit Zu Null bekommt den Bonus", () => {
  const p = scoreMatch(
    stats({ position: "GK", minutes: 90, rating: 7.2, teamGoalsConceded: 0 }),
  );
  assert.equal(p, 6 + SCORING.cleanSheet + 7); // 6 + 8 + round(0.7*10)
});

test("eingewechselter Spieler mit Rot ist im Minus", () => {
  const p = scoreMatch(
    stats({ position: "MID", minutes: 12, red: true, rating: 5.0 }),
  );
  // 4 (Kurzeinsatz) - 8 (Rot) + round((5.0-6.5)*10) = 4 - 8 - 15
  assert.equal(p, -19);
  assert.ok(p < 0);
});

test("Joker kassiert keine Gegentore der ganzen Partie", () => {
  const joker = stats({ position: "DEF", minutes: 5, teamGoalsConceded: 4 });
  const stammspieler = stats({ position: "DEF", minutes: 90, teamGoalsConceded: 4 });
  assert.equal(scoreMatch(joker), SCORING.appearance);
  assert.equal(scoreMatch(stammspieler), SCORING.appearance60 + 4 * SCORING.concededEach);
});

test("nicht eingesetzt gibt null Punkte, auch mit Rating", () => {
  assert.equal(scoreMatch(stats({ position: "FWD", minutes: 0, rating: 9.9 })), 0);
});

test("Zu Null gilt nur fuer Torwart und Abwehr", () => {
  const mid = scoreMatch(stats({ position: "MID", minutes: 90, teamGoalsConceded: 0 }));
  assert.equal(mid, SCORING.appearance60);
});
