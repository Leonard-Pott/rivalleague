import { prisma } from "@/lib/db";
import { requireManager } from "@/lib/auth";
import { handle } from "@/lib/http";
import { activeMatchday } from "@/lib/matchday";
import { KURS_STUNDE, lastMarketClose } from "@/lib/marketclock.ts";
import { LIVE_REFRESH_MINUTES, QuotaExceeded, RateLimited } from "@/lib/provider";
import {
  ensureFresh,
  linkTodaysFixtures,
  syncLiveMatches,
  snapshotTeamValues,
  syncSchedule,
  updateMarketValues,
} from "@/lib/sync";

const STUNDE = 60;

/**
 * Ersetzt den Cron: wer die Liga oeffnet, haelt die Daten nebenbei frisch.
 * Faellt ein Abruf aus - Kontingent leer, Minutenlimit, Anbieter offline -
 * darf das die Seite nicht abschiessen. Die Liga ist auch mit Daten von
 * gestern benutzbar, eine Fehlermeldung statt der Tabelle waere schlimmer.
 */
async function keepFresh(): Promise<string[]> {
  const probleme: string[] = [];
  const jobs: [string, number, () => Promise<unknown>][] = [
    ["schedule", 6 * STUNDE, syncSchedule],
    ["link", 12 * STUNDE, linkTodaysFixtures],
    ["live", LIVE_REFRESH_MINUTES, syncLiveMatches],
    [
      "prices",
      // An die Uhrzeit gebunden statt an ein Alter: gelaufen wird, wenn der
      // letzte Lauf vor dem gestrigen Marktschluss liegt. Sonst wandert die
      // Anpassung mit demjenigen, der morgens als Erster die App oeffnet.
      (Date.now() - lastMarketClose(KURS_STUNDE).getTime()) / 60_000,
      async () => {
        await updateMarketValues();
        // Direkt danach, damit der Schnappschuss den neuen Kurs zeigt.
        await snapshotTeamValues();
      },
    ],
  ];

  for (const [key, maxAge, fn] of jobs) {
    try {
      await ensureFresh(key, maxAge, async () => {
        await fn();
      });
    } catch (err) {
      if (err instanceof QuotaExceeded || err instanceof RateLimited) {
        probleme.push(`${key}: ${err.message}`);
      } else {
        console.error(`Sync-Job ${key} fehlgeschlagen`, err);
        probleme.push(`${key}: fehlgeschlagen`);
      }
    }
  }
  return probleme;
}

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (req: Request, ctx: Ctx) => {
  const { id: leagueId } = await ctx.params;
  const me = await requireManager(req, leagueId);
  const syncHinweise = await keepFresh();
  const spieltag = await activeMatchday();

  // Eigener Teamwert-Verlauf: taeglicher Schnappschuss, aelteste zuerst.
  const meinVerlauf = await prisma.managerValue.findMany({
    where: { managerId: me.id },
    orderBy: { date: "asc" },
    take: 60,
    select: { date: true, teamValue: true, budget: true },
  });

  const managers = await prisma.manager.findMany({
    where: { leagueId },
    include: {
      points: { select: { points: true } },
      roster: { include: { player: { select: { marketValue: true } } } },
    },
  });

  const table = managers
    .map((m) => ({
      managerId: m.id,
      teamName: m.teamName,
      totalPoints: m.points.reduce((sum, p) => sum + p.points, 0),
      teamValue: m.roster.reduce((sum, r) => sum + r.player.marketValue, 0),
      budget: m.budget,
      squadSize: m.roster.length,
      isMe: m.id === me.id,
    }))
    .sort((a, b) => b.totalPoints - a.totalPoints || b.teamValue - a.teamValue);

  return {
    league: {
      id: me.league.id,
      name: me.league.name,
      inviteCode: me.league.inviteCode,
      season: me.league.season,
      marketCloseHour: me.league.marketCloseHour,
    },
    me: {
      managerId: me.id,
      teamName: me.teamName,
      budget: me.budget,
      verlauf: meinVerlauf.map((v) => ({
        date: v.date.toISOString().slice(0, 10),
        teamValue: v.teamValue,
        /** Gesamtvermoegen - der Wert, an dem man Fortschritt wirklich sieht. */
        gesamt: v.teamValue + v.budget,
      })),
    },
    spieltag,
    table: table.map((row, i) => ({ ...row, rank: i + 1 })),
    /** Leer, solange alles laeuft - sonst steht hier, was gerade klemmt. */
    syncHinweise,
  };
});
