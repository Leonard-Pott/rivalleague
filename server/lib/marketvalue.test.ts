import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MV,
  expectedPoints,
  initialMarketValue,
  nextMarketValue,
} from "./marketvalue.ts";

test("Wert bleibt immer in der Spanne", () => {
  for (const start of [MV.min, 1_000_000, 12_000_000, MV.max]) {
    for (const pts of [[-50, -50, -50], [0, 0, 0], [200, 200, 200]]) {
      const v = nextMarketValue(start, pts);
      assert.ok(v >= MV.min && v <= MV.max, `${start} -> ${v}`);
    }
  }
});

test("Tagesdeckel greift bei absurden Punktzahlen", () => {
  const start = 10_000_000;
  assert.equal(nextMarketValue(start, [999, 999, 999]), Math.round(start * 1.05));
  assert.equal(nextMarketValue(start, [-999, -999, -999]), Math.round(start * 0.95));
});

test("Serie ohne Einsatz laesst den Wert monoton fallen", () => {
  let v = 10_000_000;
  for (let day = 0; day < 20; day++) {
    const next = nextMarketValue(v, [0, 0, 0]);
    assert.ok(next < v, `Tag ${day}: ${next} nicht kleiner als ${v}`);
    v = next;
  }
});

test("wer ueber der Erwartung liefert, steigt", () => {
  const start = 5_000_000;
  const over = Math.ceil(expectedPoints(start)) + 20;
  assert.ok(nextMarketValue(start, [over, over, over]) > start);
});

test("ohne Spieltage passiert nichts", () => {
  assert.equal(nextMarketValue(7_000_000, []), 7_000_000);
});

test("Startwert: Leistungstraeger deutlich ueber Ergaenzungsspieler", () => {
  const star = initialMarketValue({
    position: "FWD", minutes: 2600, rating: 7.6, goals: 18, assists: 9,
  });
  const rotation = initialMarketValue({
    position: "FWD", minutes: 600, rating: 6.4, goals: 2, assists: 1,
  });
  const neuling = initialMarketValue({
    position: "FWD", minutes: 0, rating: null, goals: 0, assists: 0,
  });

  assert.ok(star > rotation * 2, `${star} vs ${rotation}`);
  assert.ok(rotation > neuling);
  assert.equal(neuling, MV.min);
  assert.ok(star <= MV.max);
});

test("Startwert: Verteidiger braucht weniger Torbeteiligungen fuer denselben Effekt", () => {
  const base = { minutes: 2400, rating: 7.0 };
  const def = initialMarketValue({ ...base, position: "DEF", goals: 4, assists: 4 });
  const fwd = initialMarketValue({ ...base, position: "FWD", goals: 4, assists: 4 });
  assert.ok(def > fwd);
});

test("Startwert: solider Stammspieler ist kein Superstar", () => {
  // Der Fehler, den diese Pruefung fangen soll: eine lineare Kurve mit zu
  // breitem Bewertungsband machte jeden Dauerspieler zum Hoechstwert.
  const stammspieler = initialMarketValue({
    position: "DEF", minutes: 2600, rating: 7.1, goals: 2, assists: 3, topTier: true,
  });
  assert.ok(
    stammspieler < MV.max * 0.6,
    `Stammspieler bei ${stammspieler}, das ist zu nah am Hoechstwert`,
  );
  assert.ok(stammspieler > 2_000_000, `${stammspieler} ist zu billig`);
});

test("Startwert: nur echte Ausnahmespieler erreichen den Hoechstwert", () => {
  const weltklasse = initialMarketValue({
    position: "FWD", minutes: 3000, rating: 7.9, goals: 30, assists: 12, topTier: true,
  });
  assert.equal(weltklasse, MV.max);
});

test("Startwert: dieselbe Leistung eine Klasse tiefer ist weniger wert", () => {
  const stats = {
    position: "DEF" as const, minutes: 2800, rating: 7.2, goals: 4, assists: 6,
  };
  const ersteLiga = initialMarketValue({ ...stats, topTier: true });
  const zweiteLiga = initialMarketValue({ ...stats, topTier: false });
  assert.ok(zweiteLiga < ersteLiga, `${zweiteLiga} muss unter ${ersteLiga} liegen`);
});

test("Startwert: die Verteilung ist rechtsschief, nicht gleichverteilt", () => {
  // Gleichmaessig steigende Leistung darf nicht gleichmaessig steigende Werte
  // ergeben - sonst fuehlt sich der ganze Markt gleich teuer an.
  const werte = [0.2, 0.4, 0.6, 0.8, 1.0].map((f) =>
    initialMarketValue({
      position: "MID", minutes: 2400 * f, rating: 6.3 + 1.3 * f, goals: 10 * f, assists: 10 * f,
      topTier: true,
    }),
  );
  const median = werte[2];
  assert.ok(median < MV.max / 3, `Median ${median} liegt zu hoch`);
  for (let i = 1; i < werte.length; i++) assert.ok(werte[i] > werte[i - 1]);
});
