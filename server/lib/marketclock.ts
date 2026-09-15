/**
 * Marktschluss ist eine Uhrzeit nach deutscher Ortszeit, gespeichert wird in
 * UTC. Zwischen beiden liegt je nach Jahreszeit eine oder zwei Stunden - wer
 * das fest verdrahtet, hat den Marktschluss ein halbes Jahr lang um eine
 * Stunde verschoben, ohne es zu merken.
 *
 * Ohne Zeitzonen-Bibliothek: Intl kennt die Regeln bereits.
 */
const ZONE = "Europe/Berlin";

/** Verschiebung der deutschen Ortszeit gegenueber UTC zu diesem Zeitpunkt. */
export function zoneOffsetMs(at: Date): number {
  // "en-CA" liefert ISO-nahes YYYY-MM-DD, das sich verlaesslich zurueckparsen laesst.
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(at);

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const alsUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") % 24,
    get("minute"),
    get("second"),
  );
  return alsUtc - at.getTime();
}

/**
 * Naechster Marktschluss nach `now`. Ist die Uhrzeit heute schon vorbei,
 * zaehlt der morgige.
 */
export function nextMarketClose(hour: number, now: Date = new Date()): Date {
  for (let tagesVersatz = 0; tagesVersatz <= 2; tagesVersatz++) {
    const kandidat = closeOnDay(hour, now, tagesVersatz);
    if (kandidat.getTime() > now.getTime()) return kandidat;
  }
  throw new Error("Kein Marktschluss gefunden");
}

function closeOnDay(hour: number, reference: Date, dayOffset: number): Date {
  const offset = zoneOffsetMs(reference);
  const ortszeit = new Date(reference.getTime() + offset);

  const zielUtc = Date.UTC(
    ortszeit.getUTCFullYear(),
    ortszeit.getUTCMonth(),
    ortszeit.getUTCDate() + dayOffset,
    hour,
    0,
    0,
  );

  // Erste Schaetzung mit dem heutigen Versatz, dann mit dem am Zieltag
  // gueltigen nachziehen - sonst liegt man an den beiden Umstellungstagen
  // um eine Stunde daneben.
  const grob = new Date(zielUtc - offset);
  return new Date(zielUtc - zoneOffsetMs(grob));
}
