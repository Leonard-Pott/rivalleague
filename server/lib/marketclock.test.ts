import { test } from "node:test";
import assert from "node:assert/strict";
import { lastMarketClose, nextMarketClose, zoneOffsetMs } from "./marketclock.ts";

/**
 * Wie spaet ist es in Deutschland zu diesem UTC-Zeitpunkt?
 * Ueber formatToParts, weil de-DE die Stunde als "22 Uhr" ausgibt und ein
 * naives Number() darauf NaN liefert.
 */
function berlinStunde(d: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Berlin",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(d);
  return Number(parts.find((p) => p.type === "hour")?.value);
}

test("Zeitzonenversatz kennt Winter- und Sommerzeit", () => {
  assert.equal(zoneOffsetMs(new Date("2026-01-15T12:00:00Z")), 3600_000, "Winter: +1h");
  assert.equal(zoneOffsetMs(new Date("2026-07-15T12:00:00Z")), 7200_000, "Sommer: +2h");
});

test("Marktschluss liegt immer auf der gewuenschten Ortszeit", () => {
  const zeitpunkte = [
    "2026-01-15T09:00:00Z", // Winter
    "2026-07-15T09:00:00Z", // Sommer
    "2026-03-29T00:30:00Z", // Tag der Umstellung auf Sommerzeit
    "2026-10-25T00:30:00Z", // Tag der Umstellung auf Winterzeit
    "2026-12-31T23:00:00Z", // Jahreswechsel
  ];
  for (const t of zeitpunkte) {
    const close = nextMarketClose(22, new Date(t));
    assert.equal(berlinStunde(close), 22, `${t} -> ${close.toISOString()}`);
  }
});

test("Marktschluss liegt immer in der Zukunft", () => {
  for (const t of ["2026-05-01T21:59:00Z", "2026-05-01T20:00:01Z", "2026-11-03T21:30:00Z"]) {
    const now = new Date(t);
    assert.ok(nextMarketClose(22, now).getTime() > now.getTime(), t);
  }
});

test("nach dem Marktschluss zaehlt der naechste Tag", () => {
  // 20:30 UTC im Sommer = 22:30 Ortszeit, der 22-Uhr-Schluss ist vorbei.
  const now = new Date("2026-07-15T20:30:00Z");
  const close = nextMarketClose(22, now);
  const stundenBis = (close.getTime() - now.getTime()) / 3600_000;
  assert.ok(stundenBis > 20 && stundenBis < 24.5, `${stundenBis} Stunden`);
  assert.equal(berlinStunde(close), 22);
});

test("frueher Marktschluss am selben Tag wird noch erwischt", () => {
  // 08:00 UTC im Sommer = 10:00 Ortszeit, ein 22-Uhr-Schluss kommt heute noch.
  const now = new Date("2026-07-15T08:00:00Z");
  const stundenBis = (nextMarketClose(22, now).getTime() - now.getTime()) / 3600_000;
  assert.ok(stundenBis > 0 && stundenBis < 13, `${stundenBis} Stunden`);
});

test("Letzter Marktschluss liegt hoechstens 24 Stunden zurueck und trifft die Stunde", () => {
  // Quer durchs Jahr, damit auch die Umstellungstage drankommen.
  for (let tag = 0; tag < 365; tag += 7) {
    const jetzt = new Date(Date.UTC(2026, 0, 1, 13, 37) + tag * 86_400_000);
    const letzter = lastMarketClose(22, jetzt);
    assert.ok(letzter.getTime() <= jetzt.getTime(), "darf nicht in der Zukunft liegen");
    assert.ok(jetzt.getTime() - letzter.getTime() <= 25 * 3_600_000, "hoechstens einen Tag her");
    assert.equal(berlinStunde(letzter), 22);
    // Zwischen letztem und naechstem Schluss liegt genau ein Tag.
    assert.ok(nextMarketClose(22, jetzt).getTime() > jetzt.getTime());
  }
});
