import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import * as openliga from "./openliga";
import * as provider from "./provider";
import { matchTeams } from "./match-teams";
import { scoreMatch, type MatchStats } from "./scoring.ts";
import {
  initialMarketValue,
  MV,
  nextMarketValue,
  type SeasonStats,
} from "./marketvalue.ts";

export function season(): number {
  return Number(process.env.SEASON ?? new Date().getFullYear());
}

/**
 * Ersetzt einen Cron. Laeuft beim API-Aufruf und tut nur etwas, wenn der Job
 * abgelaufen ist. Kostet nichts, wenn zehn Freunde gleichzeitig die App
 * oeffnen - der Zeitstempel haengt am Job, nicht am Nutzer.
 */
export async function ensureFresh(
  key: string,
  maxAgeMinutes: number,
  fn: () => Promise<void>,
): Promise<boolean> {
  const state = await prisma.syncState.findUnique({ where: { key } });
  const age = state ? (Date.now() - state.lastRunAt.getTime()) / 60000 : Infinity;
  if (age < maxAgeMinutes) return false;

  await fn();
  await prisma.syncState.upsert({
    where: { key },
    update: { lastRunAt: new Date() },
    create: { key, lastRunAt: new Date() },
  });
  return true;
}

/**
 * Verbindet die Vereins-IDs beider Quellen. Kostet einen API-Aufruf und muss
 * nur laufen, wenn sich die Liga aendert - also einmal pro Saison.
 */
export async function syncTeams(): Promise<{ matched: number; unmatched: string[] }> {
  const [olbTeams, apiTeams] = await Promise.all([
    openliga.fetchTeams(season()),
    provider.fetchGermanTeams(),
  ]);

  const { matched, unmatched } = matchTeams(
    olbTeams,
    apiTeams.map((t) => ({ id: t.id, name: t.name })),
  );
  const logoById = new Map(apiTeams.map((t) => [t.id, t.logoUrl]));

  for (const m of matched) {
    await prisma.team.upsert({
      where: { id: m.teamId },
      update: { name: m.teamName, openligaId: m.openligaId, logoUrl: logoById.get(m.teamId) },
      create: {
        id: m.teamId,
        name: m.teamName,
        openligaId: m.openligaId,
        logoUrl: logoById.get(m.teamId),
      },
    });
  }

  return { matched: matched.length, unmatched: unmatched.map((u) => u.openligaName) };
}

/** Kompletter Spielplan aus OpenLigaDB. Kostet kein API-Football-Kontingent. */
export async function syncSchedule(): Promise<number> {
  const teams = await prisma.team.findMany();
  if (teams.length === 0) throw new Error("Erst syncTeams() laufen lassen");
  const byOpenliga = new Map(teams.map((t) => [t.openligaId, t.id]));

  const matches = await openliga.fetchSeasonMatches(season());
  let written = 0;

  for (const m of matches) {
    const homeTeamId = byOpenliga.get(m.homeOpenligaId);
    const awayTeamId = byOpenliga.get(m.awayOpenligaId);
    if (!homeTeamId || !awayTeamId) continue; // Verein nicht zugeordnet

    const data = {
      matchday: m.matchday,
      kickoff: m.kickoff,
      homeTeamId,
      awayTeamId,
      finished: m.finished,
      homeGoals: m.homeGoals,
      awayGoals: m.awayGoals,
    };
    await prisma.match.upsert({
      where: { id: m.matchId },
      update: data,
      create: { id: m.matchId, ...data },
    });
    written++;
  }
  return written;
}

/**
 * Kader aller Vereine, ein Aufruf pro Verein. Arbeitet die am laengsten nicht
 * aktualisierten Vereine zuerst ab und schreibt nach jedem Verein den
 * Fortschritt weg: reisst das Minutenlimit mittendrin, macht der naechste
 * Lauf dort weiter, statt bereits geholte Kader erneut zu bezahlen.
 */
export async function syncSquads(
  limit = 18,
): Promise<{ teams: number; players: number; offen: number }> {
  const teams = await prisma.team.findMany({
    orderBy: [{ squadSyncedAt: { sort: "asc", nulls: "first" } }],
    take: limit,
  });

  let players = 0;
  let done = 0;

  for (const team of teams) {
    const squad = await provider.fetchSquad(team.id);
    for (const p of squad) {
      await prisma.player.upsert({
        where: { id: p.id },
        update: { name: p.name, position: p.position, teamId: team.id, photoUrl: p.photoUrl },
        create: {
          id: p.id,
          name: p.name,
          position: p.position,
          teamId: team.id,
          photoUrl: p.photoUrl,
          marketValue: 0, // wird von seedMarketValues gesetzt
        },
      });
      players++;
    }
    await prisma.team.update({
      where: { id: team.id },
      data: { squadSyncedAt: new Date() },
    });
    done++;
  }

  const offen = await prisma.team.count({ where: { squadSyncedAt: null } });
  return { teams: done, players, offen };
}

/**
 * Startmarktwerte aus einer freigeschalteten Vorsaison. Der Free-Tier sperrt
 * 2025 und 2026, deshalb ist 2024 die juengste nutzbare Datenlage. Die
 * taegliche Marktwert-Engine zieht das binnen weniger Wochen gerade.
 */
export async function seedMarketValues(
  statsSeason = 2024,
  maxTeams = 18,
  pagesPerTeam = 2,
): Promise<{ teams: number; players: number; offen: number; geschaetzt: number }> {
  // Fortschritt braucht keine eigene Spalte: ein Verein gilt als erledigt,
  // sobald mindestens ein Spieler ROHDATEN hat. Der Marktwert taugt dafuer
  // nicht - estimateMissingValues setzt ihn auch bei Spielern ohne Datenlage,
  // damit waere jeder Verein sofort faelschlich als erledigt gemeldet.
  const offeneVereine = { players: { none: { seedStats: { not: Prisma.DbNull } } } };
  const teams = await prisma.team.findMany({ where: offeneVereine, take: maxTeams });

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  let players = 0;

  for (const team of teams) {
    const known = new Map(
      (
        await prisma.player.findMany({
          where: { teamId: team.id },
          select: { id: true, position: true },
        })
      ).map((p) => [p.id, p.position]),
    );

    for (let page = 1; page <= pagesPerTeam; page++) {
      const res = await provider.fetchTeamSeasonPlayers(team.id, statsSeason, page);

      for (const s of res.players) {
        const position = known.get(s.playerId);
        if (!position) continue; // gehoert nicht mehr zu diesem Kader

        const seedStats = {
          position,
          minutes: s.minutes,
          rating: s.rating,
          goals: s.goals,
          assists: s.assists,
          topTier: s.topTier,
        };
        const value = initialMarketValue(seedStats);
        await prisma.player.update({
          where: { id: s.playerId },
          data: { marketValue: value, seedStats },
        });
        await prisma.playerValue.upsert({
          where: { playerId_date: { playerId: s.playerId, date: today } },
          update: { value },
          create: { playerId: s.playerId, date: today, value },
        });
        players++;
      }

      if (page >= res.totalPages) break;
    }
  }

  const geschaetzt = await estimateMissingValues();
  const offen = await prisma.team.count({ where: offeneVereine });
  return { teams: teams.length, players, offen, geschaetzt };
}

/**
 * Setzt Spieler ohne Vorsaisondaten auf den Median ihrer Position statt auf
 * den Mindestwert.
 *
 * Der Grund ist spielerisch, nicht technisch: Zugaenge aus dem Ausland und
 * Jugendspieler tauchen in keiner freigeschalteten Statistik auf. Stuenden
 * sie alle bei 500 Tsd, waere die beste Strategie, den Kader mit lauter
 * Unbekannten zu fuellen - und das ist kein Spiel, sondern eine Luecke.
 * Ein Unbekannter ist ein durchschnittlicher Spieler, bis er es widerlegt;
 * die taegliche Anpassung korrigiert ihn ohnehin binnen weniger Wochen.
 */
export async function estimateMissingValues(): Promise<number> {
  const positions = ["GK", "DEF", "MID", "FWD"] as const;
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  let updated = 0;

  for (const position of positions) {
    const bekannt = await prisma.player.findMany({
      where: { position, seedStats: { not: Prisma.DbNull } },
      select: { marketValue: true },
      orderBy: { marketValue: "asc" },
    });
    if (bekannt.length === 0) continue;

    const median = bekannt[Math.floor(bekannt.length / 2)].marketValue;
    const ohneDaten = await prisma.player.findMany({
      where: { position, seedStats: { equals: Prisma.DbNull } },
      select: { id: true },
    });

    for (const p of ohneDaten) {
      await prisma.player.update({ where: { id: p.id }, data: { marketValue: median } });
      await prisma.playerValue.upsert({
        where: { playerId_date: { playerId: p.id, date: today } },
        update: { value: median },
        create: { playerId: p.id, date: today, value: median },
      });
      updated++;
    }
  }
  return updated;
}

/**
 * Haelt Teamwert und Budget jedes Managers fest. Laeuft nach der taeglichen
 * Marktwertanpassung, damit der Schnappschuss den neuen Kurs zeigt.
 */
export async function snapshotTeamValues(): Promise<number> {
  const managers = await prisma.manager.findMany({
    select: {
      id: true,
      budget: true,
      roster: { select: { player: { select: { marketValue: true } } } },
    },
  });

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  for (const m of managers) {
    const teamValue = m.roster.reduce((sum, r) => sum + r.player.marketValue, 0);
    await prisma.managerValue.upsert({
      where: { managerId_date: { managerId: m.id, date: today } },
      update: { teamValue, budget: m.budget },
      create: { managerId: m.id, date: today, teamValue, budget: m.budget },
    });
  }
  return managers.length;
}

/**
 * Rechnet alle Startwerte aus den gespeicherten Rohdaten neu. Kostet kein
 * API-Kontingent - genau dafuer liegt seedStats in der Datenbank.
 */
export async function recalcSeedValues(): Promise<number> {
  const players = await prisma.player.findMany({
    where: { seedStats: { not: Prisma.DbNull } },
    select: { id: true, seedStats: true },
  });

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  for (const p of players) {
    const value = initialMarketValue(p.seedStats as unknown as SeasonStats);
    await prisma.player.update({ where: { id: p.id }, data: { marketValue: value } });
    await prisma.playerValue.upsert({
      where: { playerId_date: { playerId: p.id, date: today } },
      update: { value },
      create: { playerId: p.id, date: today, value },
    });
  }

  await estimateMissingValues();
  return players.length;
}

/**
 * Verknuepft die Spiele des Tagesfensters mit ihrer API-Football-Kennung.
 * Ohne diese Bruecke waeren die Spielerstatistiken nicht abrufbar: OpenLigaDB
 * kennt die Partie, aber nicht die fixture-ID des anderen Anbieters.
 */
export async function linkTodaysFixtures(): Promise<number> {
  const dates = [-1, 0, 1].map((offset) => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + offset);
    return d.toISOString().slice(0, 10);
  });

  let linked = 0;
  for (const date of dates) {
    const fixtures = await provider.fetchFixturesOn(date);
    for (const f of fixtures) {
      const match = await prisma.match.findFirst({
        where: {
          homeTeamId: f.homeTeamId,
          awayTeamId: f.awayTeamId,
          fixtureId: null,
        },
      });
      if (!match) continue;
      await prisma.match.update({
        where: { id: match.id },
        data: { fixtureId: f.fixtureId },
      });
      linked++;
    }
  }
  return linked;
}

/**
 * Holt die Spielerstatistiken einer Partie und rechnet sie in Punkte um.
 * Ein Aufruf deckt beide Mannschaften ab.
 */
export async function syncMatchStats(matchId: number): Promise<number> {
  const match = await prisma.match.findUnique({ where: { id: matchId } });
  if (!match?.fixtureId) return 0;

  const lines = await provider.fetchFixturePlayers(match.fixtureId);
  const known = new Set(
    (await prisma.player.findMany({ select: { id: true } })).map((p) => p.id),
  );

  let written = 0;
  for (const line of lines) {
    if (!known.has(line.playerId)) continue; // z.B. Spieler nach Kader-Sync gewechselt

    // Gegentore der eigenen Mannschaft, nicht die des Spielers.
    const conceded =
      line.teamId === match.homeTeamId ? (match.awayGoals ?? 0) : (match.homeGoals ?? 0);

    const stats: MatchStats = {
      position: line.position,
      minutes: line.minutes,
      rating: line.rating,
      goals: line.goals,
      assists: line.assists,
      ownGoals: 0, // siehe provider.fetchFixturePlayers
      yellow: line.yellow,
      yellowRed: line.yellowRed,
      red: line.red,
      penaltyMissed: line.penaltyMissed,
      penaltySaved: line.penaltySaved,
      teamGoalsConceded: conceded,
    };

    const points = scoreMatch(stats);
    await prisma.playerPoints.upsert({
      where: { playerId_matchday: { playerId: line.playerId, matchday: match.matchday } },
      update: { points, statsJson: stats },
      create: { playerId: line.playerId, matchday: match.matchday, points, statsJson: stats },
    });
    written++;
  }

  await prisma.match.update({
    where: { id: matchId },
    data: { statsSyncedAt: new Date() },
  });
  return written;
}

/**
 * Holt die Statistiken aller Spiele, die gerade laufen oder frisch abgepfiffen
 * sind, und rechnet die Managerpunkte neu.
 *
 * Das Zeitfenster ist grosszuegig, weil der Free-Tier kein Nachladen erlaubt:
 * was hier verpasst wird, ist endgueltig weg. Lieber ein Aufruf zu viel als
 * ein Spieltag ohne Punkte.
 */
export async function syncLiveMatches(): Promise<{ spiele: number; eintraege: number }> {
  const jetzt = Date.now();
  const kandidaten = await prisma.match.findMany({
    where: {
      fixtureId: { not: null },
      kickoff: {
        // Angepfiffen, und hoechstens sechs Stunden her.
        lte: new Date(jetzt),
        gte: new Date(jetzt - 6 * 3600_000),
      },
    },
  });

  // Abgepfiffene Spiele, deren Statistik schon final geholt wurde, nicht
  // erneut bezahlen.
  const offen = kandidaten.filter((m) => !(m.finished && m.statsSyncedAt));

  let eintraege = 0;
  const spieltage = new Set<number>();
  for (const match of offen) {
    eintraege += await syncMatchStats(match.id);
    spieltage.add(match.matchday);
  }
  for (const tag of spieltage) await recomputeManagerPoints(tag);

  return { spiele: offen.length, eintraege };
}

/** Summiert die Punkte der Startelf jedes Managers fuer einen Spieltag. */
export async function recomputeManagerPoints(matchday: number): Promise<number> {
  const lineups = await prisma.lineup.findMany({
    where: { matchday },
    include: { slots: { where: { isStarter: true } } },
  });

  const pointsByPlayer = new Map(
    (await prisma.playerPoints.findMany({ where: { matchday } })).map((p) => [
      p.playerId,
      p.points,
    ]),
  );

  for (const lineup of lineups) {
    const total = lineup.slots.reduce(
      (sum, slot) => sum + (pointsByPlayer.get(slot.playerId) ?? 0),
      0,
    );
    await prisma.managerPoints.upsert({
      where: { managerId_matchday: { managerId: lineup.managerId, matchday } },
      update: { points: total },
      create: { managerId: lineup.managerId, matchday, points: total },
    });
  }
  return lineups.length;
}

/**
 * Taegliche Marktwertanpassung anhand der Form der letzten Spieltage.
 *
 * Wichtig: ein Spieler ohne Einsatz hat gar keinen Punkte-Datensatz. Wuerde
 * man nur die vorhandenen Zeilen heranziehen, verlore ein Dauerreservist nie
 * an Wert - das Gegenteil des Gewollten. Deshalb werden die zuletzt
 * gespielten Spieltage bestimmt und fehlende Eintraege als 0 gewertet.
 */
export async function updateMarketValues(): Promise<number> {
  const playedDays = (
    await prisma.match.findMany({
      where: { statsSyncedAt: { not: null } },
      distinct: ["matchday"],
      orderBy: { matchday: "desc" },
      take: MV.formWindow,
      select: { matchday: true },
    })
  ).map((m) => m.matchday);

  if (playedDays.length === 0) return 0; // vor dem ersten Spieltag passiert nichts

  const players = await prisma.player.findMany({
    select: {
      id: true,
      marketValue: true,
      points: {
        where: { matchday: { in: playedDays } },
        select: { matchday: true, points: true },
      },
    },
  });

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  let changed = 0;

  for (const p of players) {
    const byDay = new Map(p.points.map((x) => [x.matchday, x.points]));
    const form = playedDays.map((day) => byDay.get(day) ?? 0);
    const next = nextMarketValue(p.marketValue, form);
    if (next === p.marketValue) continue;
    await prisma.player.update({ where: { id: p.id }, data: { marketValue: next } });
    await prisma.playerValue.upsert({
      where: { playerId_date: { playerId: p.id, date: today } },
      update: { value: next },
      create: { playerId: p.id, date: today, value: next },
    });
    changed++;
  }
  return changed;
}
