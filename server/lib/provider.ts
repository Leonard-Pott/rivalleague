import { prisma } from "./db";
import type { Position } from "./scoring.ts";

const BASE = "https://v3.football.api-sports.io";
export const BUNDESLIGA = 78;

/**
 * Der Free-Tier erlaubt 100 Aufrufe pro Tag, Reset um 00:00 UTC. Der Puffer
 * verhindert, dass ein Fehlversuch am Ende des Tages den Sync des naechsten
 * Spieltags blockiert. Ohne diesen Zaehler waere die App an zufaelligen Tagen
 * ohne erkennbaren Grund kaputt.
 */
export const DAILY_LIMIT = 90;

/** Wie oft die Punkte laufender Spiele nachgezogen werden. Kalibrierknopf. */
export const LIVE_REFRESH_MINUTES = 15;

export class QuotaExceeded extends Error {}
export class RateLimited extends Error {}

/**
 * Der Free-Tier begrenzt nicht nur den Tag, sondern auch die Minute (10
 * Aufrufe). Achtzehn Kader am Stueck laufen sonst nach dem zehnten in ein
 * HTTP 429 - und der verbrauchte Aufruf ist trotzdem weg.
 */
const MIN_INTERVAL_MS = Number(process.env.API_MIN_INTERVAL_MS ?? 6500);

let lastCallAt = 0;
let queue: Promise<void> = Promise.resolve();

/** Reiht Aufrufe hintereinander und haelt den Mindestabstand ein. */
function throttle(): Promise<void> {
  queue = queue.then(async () => {
    const wait = MIN_INTERVAL_MS - (Date.now() - lastCallAt);
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastCallAt = Date.now();
  });
  return queue;
}

function today(): string {
  return new Date().toISOString().slice(0, 10); // UTC, wie der Anbieter
}

export async function usageToday(): Promise<number> {
  const row = await prisma.apiUsage.findUnique({ where: { day: today() } });
  return row?.calls ?? 0;
}

/** Zaehlt den Aufruf und bricht ab, bevor das Kontingent reisst. */
async function spendBudget(): Promise<void> {
  const day = today();
  const usage = await prisma.apiUsage.upsert({
    where: { day },
    update: { calls: { increment: 1 } },
    create: { day, calls: 1 },
  });
  if (usage.calls > DAILY_LIMIT) {
    throw new QuotaExceeded(
      `Tageskontingent erschoepft (${usage.calls}/${DAILY_LIMIT}). Reset um 00:00 UTC.`,
    );
  }
}

/** Setzt den Tageszaehler, aber nur nach oben. */
async function raiseUsage(auf: number): Promise<void> {
  const day = today();
  const aktuell = await prisma.apiUsage.findUnique({ where: { day } });
  if ((aktuell?.calls ?? 0) >= auf) return;
  await prisma.apiUsage.upsert({
    where: { day },
    update: { calls: auf },
    create: { day, calls: auf },
  });
}

/**
 * Zieht den eigenen Zaehler auf den Stand des Anbieters nach - aber nur nach
 * oben, nie nach unten.
 *
 * Der Header ist naemlich nicht vertrauenswuerdig: ist das Tageslimit
 * erreicht, meldet der Anbieter weiterhin "99 von 100 uebrig" und verweigert
 * im selben Atemzug die Anfrage. Wuerde man ihn blind uebernehmen, setzte er
 * den Zaehler zurueck und die App liefe im Kreis gegen eine tote API.
 *
 * Nach oben ist er dagegen wertvoll: er kennt auch Aufrufe, die ausserhalb
 * der App passiert sind, etwa beim Ausprobieren im Terminal.
 */
async function syncUsageFromHeaders(res: Response): Promise<void> {
  const limit = Number(res.headers.get("x-ratelimit-requests-limit"));
  const remaining = Number(res.headers.get("x-ratelimit-requests-remaining"));
  if (!Number.isFinite(limit) || !Number.isFinite(remaining) || limit <= 0) return;
  await raiseUsage(limit - remaining);
}

/**
 * Das Tageslimit des Anbieters ist kein Fehler, sondern ein Zustand. Der
 * Zaehler wird dabei ans Limit gesetzt, damit der eigene Waechter ab sofort
 * blockt - sonst liefe jeder weitere Job in dieselbe Wand.
 */
async function assertDailyLimitNotHit(errors: unknown): Promise<void> {
  const requests = (errors as { requests?: string } | null)?.requests;
  if (typeof requests === "string" && /request limit/i.test(requests)) {
    await raiseUsage(DAILY_LIMIT + 1);
    throw new QuotaExceeded(requests);
  }
}

function assertNoApiError(errors: unknown, path: string): void {
  // Der Anbieter meldet Plan-Sperren mit HTTP 200 und einem errors-Objekt.
  const hasError = Array.isArray(errors)
    ? errors.length > 0
    : Object.keys(errors ?? {}).length > 0;
  if (hasError) {
    throw new Error(`API-Football: ${JSON.stringify(errors)} bei ${path}`);
  }
}

async function call<T>(path: string): Promise<T> {
  await throttle();
  await spendBudget();

  const key = process.env.API_FOOTBALL_KEY;
  if (!key) throw new Error("API_FOOTBALL_KEY fehlt in .env");

  const res = await fetch(`${BASE}${path}`, { headers: { "x-apisports-key": key } });
  await syncUsageFromHeaders(res);
  if (res.status === 429) {
    throw new RateLimited(`Minutenlimit erreicht bei ${path}. Spaeter erneut versuchen.`);
  }
  if (!res.ok) throw new Error(`API-Football ${res.status} bei ${path}`);

  const json = (await res.json()) as { response: T; errors: unknown };
  await assertDailyLimitNotHit(json.errors);
  assertNoApiError(json.errors, path);
  return json.response;
}

function toPosition(raw: string | null | undefined): Position {
  switch ((raw ?? "").charAt(0).toUpperCase()) {
    case "G":
      return "GK";
    case "D":
      return "DEF";
    case "M":
      return "MID";
    default:
      return "FWD"; // "Attacker" / "F" / unbekannt
  }
}

export type ProviderTeam = { id: number; name: string; logoUrl: string | null };

/**
 * Alle deutschen Vereine in einem Aufruf. Der Umweg ueber das Land ist noetig,
 * weil /teams?league=78 einen season-Parameter verlangt und der Free-Tier die
 * laufende Saison sperrt.
 */
export async function fetchGermanTeams(): Promise<ProviderTeam[]> {
  const res = await call<{ team: { id: number; name: string; logo: string | null } }[]>(
    "/teams?country=Germany",
  );
  return res.map((r) => ({ id: r.team.id, name: r.team.name, logoUrl: r.team.logo }));
}

export type ProviderPlayer = {
  id: number;
  name: string;
  position: Position;
  photoUrl: string | null;
};

export async function fetchSquad(teamId: number): Promise<ProviderPlayer[]> {
  const res = await call<
    { players: { id: number; name: string; position: string; photo: string | null }[] }[]
  >(`/players/squads?team=${teamId}`);
  return (res[0]?.players ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    position: toPosition(p.position),
    photoUrl: p.photo,
  }));
}

export type ProviderFixture = {
  fixtureId: number;
  kickoff: string;
  status: string;
  homeTeamId: number;
  awayTeamId: number;
  homeGoals: number | null;
  awayGoals: number | null;
};

/**
 * Bundesliga-Spiele eines Tages. Der Liga-Filter darf NICHT mitgeschickt
 * werden - er erzwingt einen season-Parameter, und der ist im Free-Tier fuer
 * die laufende Saison gesperrt. Also alles holen und selbst filtern.
 * Nutzbar nur fuer heute plus/minus einen Tag.
 */
export async function fetchFixturesOn(date: string): Promise<ProviderFixture[]> {
  const res = await call<
    {
      fixture: { id: number; date: string; status: { short: string } };
      league: { id: number };
      teams: { home: { id: number }; away: { id: number } };
      goals: { home: number | null; away: number | null };
    }[]
  >(`/fixtures?date=${date}`);

  return res
    .filter((f) => f.league.id === BUNDESLIGA)
    .map((f) => ({
      fixtureId: f.fixture.id,
      kickoff: f.fixture.date,
      status: f.fixture.status.short,
      homeTeamId: f.teams.home.id,
      awayTeamId: f.teams.away.id,
      homeGoals: f.goals.home,
      awayGoals: f.goals.away,
    }));
}

export type RawPlayerLine = {
  playerId: number;
  teamId: number;
  position: Position;
  minutes: number;
  rating: number | null;
  goals: number;
  assists: number;
  yellow: boolean;
  /** Glatt Rot: rote Karte ohne vorherige gelbe. */
  red: boolean;
  /** Gelb-Rot: aus gelber und roter Karte im selben Spiel abgeleitet. */
  yellowRed: boolean;
  penaltyMissed: number;
  penaltySaved: number;
};

/**
 * Spielerstatistiken eines Spiels, ein Aufruf fuer beide Mannschaften.
 *
 * Eigentore fehlen hier: der Anbieter fuehrt sie nur unter /fixtures/events,
 * was pro Spiel einen zweiten Aufruf kostet und das Tageskontingent an einem
 * Bundesliga-Samstag verdoppeln wuerde. Bei rund einem Eigentor pro Spieltag
 * ist der Preis zu hoch.
 * ponytail: Eigentore ignoriert, /fixtures/events wenn das Kontingent steigt.
 */
export async function fetchFixturePlayers(fixtureId: number): Promise<RawPlayerLine[]> {
  const res = await call<
    {
      team: { id: number };
      players: {
        player: { id: number };
        statistics: {
          games: { minutes: number | null; position: string | null; rating: string | null };
          goals: { total: number | null; assists: number | null };
          cards: { yellow: number | null; red: number | null };
          penalty: { missed: number | null; saved: number | null };
        }[];
      }[];
    }[]
  >(`/fixtures/players?fixture=${fixtureId}`);

  const lines: RawPlayerLine[] = [];
  for (const block of res) {
    for (const entry of block.players) {
      const s = entry.statistics[0];
      if (!s) continue;
      const yellow = (s.cards.yellow ?? 0) > 0;
      const red = (s.cards.red ?? 0) > 0;
      lines.push({
        playerId: entry.player.id,
        teamId: block.team.id,
        position: toPosition(s.games.position),
        minutes: s.games.minutes ?? 0,
        rating: s.games.rating ? Number(s.games.rating) : null,
        goals: s.goals.total ?? 0,
        assists: s.goals.assists ?? 0,
        // Der Anbieter unterscheidet Rot und Gelb-Rot nicht. Gelb plus Rot im
        // selben Spiel ist praktisch immer Gelb-Rot.
        yellow: yellow && !red,
        red: red && !yellow,
        yellowRed: red && yellow,
        penaltyMissed: s.penalty.missed ?? 0,
        penaltySaved: s.penalty.saved ?? 0,
      });
    }
  }
  return lines;
}

export type ProviderSeasonStat = {
  playerId: number;
  name: string;
  position: Position;
  minutes: number;
  rating: number | null;
  goals: number;
  assists: number;
  /** Bundesliga oder eine Klasse tiefer - macht dieselbe Zahl unterschiedlich wert. */
  topTier: boolean;
};

/**
 * Eine Seite Saisonstatistiken eines Vereins.
 *
 * Warum vereinsweise und nicht ligaweit: der Free-Tier deckelt den
 * page-Parameter bei 3, ligaweit waeren das 60 von 760 Spielern. Ueber die
 * Vereine kommt man an jeden Kader - und bei Auf- und Absteigern sogar an
 * deren Zweitliga-Statistiken, die genauso aussagekraeftig sind.
 *
 * Nur fuer freigeschaltete Saisons (2022-2024).
 */
export async function fetchTeamSeasonPlayers(
  teamId: number,
  season: number,
  page: number,
): Promise<{ players: ProviderSeasonStat[]; totalPages: number }> {
  await throttle();
  await spendBudget();

  const key = process.env.API_FOOTBALL_KEY;
  if (!key) throw new Error("API_FOOTBALL_KEY fehlt in .env");

  const path = `/players?team=${teamId}&season=${season}&page=${page}`;
  const res = await fetch(`${BASE}${path}`, { headers: { "x-apisports-key": key } });
  await syncUsageFromHeaders(res);
  if (res.status === 429) throw new RateLimited(`Minutenlimit erreicht bei ${path}`);
  if (!res.ok) throw new Error(`API-Football ${res.status} bei ${path}`);

  const json = (await res.json()) as {
    response: {
      player: { id: number; name: string };
      statistics: {
        league: { id: number };
        games: {
          minutes: number | null;
          position: string | null;
          rating: string | null;
          appearences: number | null;
        };
        goals: { total: number | null; assists: number | null };
      }[];
    }[];
    paging: { total: number };
    errors: unknown;
  };
  await assertDailyLimitNotHit(json.errors);
  assertNoApiError(json.errors, path);

  const players = json.response.map((r) => {
    // Ein Spieler kann in einer Saison fuer mehrere Vereine gelaufen sein.
    const total = r.statistics.reduce(
      (acc, s) => ({
        minutes: acc.minutes + (s.games.minutes ?? 0),
        goals: acc.goals + (s.goals.total ?? 0),
        assists: acc.assists + (s.goals.assists ?? 0),
        ratingSum:
          acc.ratingSum +
          (s.games.rating ? Number(s.games.rating) * (s.games.appearences ?? 0) : 0),
        apps: acc.apps + (s.games.appearences ?? 0),
      }),
      { minutes: 0, goals: 0, assists: 0, ratingSum: 0, apps: 0 },
    );
    // Der Wettbewerb mit den meisten Minuten bestimmt die Spielklasse.
    const mainComp = [...r.statistics].sort(
      (a, b) => (b.games.minutes ?? 0) - (a.games.minutes ?? 0),
    )[0];
    return {
      playerId: r.player.id,
      name: r.player.name,
      position: toPosition(r.statistics[0]?.games.position),
      minutes: total.minutes,
      rating: total.apps > 0 && total.ratingSum > 0 ? total.ratingSum / total.apps : null,
      goals: total.goals,
      assists: total.assists,
      topTier: mainComp?.league.id === BUNDESLIGA,
    };
  });

  return { players, totalPages: json.paging.total };
}
