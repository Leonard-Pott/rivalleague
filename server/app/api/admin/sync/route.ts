import { requireAdmin } from "@/lib/admin";
import { HttpError } from "@/lib/guards";
import { handle } from "@/lib/http";
import { prisma } from "@/lib/db";
import * as sync from "@/lib/sync";

/**
 * Alle Datenimporte an einer Stelle, von Hand ausloesbar. Das ersetzt ein
 * separates Seed-Skript: derselbe Code, den auch der automatische Sync
 * benutzt, und kein zweiter Weg, TypeScript ausserhalb von Next auszufuehren.
 */
const JOBS: Record<string, (params: URLSearchParams) => Promise<unknown>> = {
  /** Einmal pro Saison: Vereins-IDs beider Quellen verknuepfen. 1 Aufruf. */
  teams: () => sync.syncTeams(),

  /** Kompletter Spielplan aus OpenLigaDB. Kostenlos. */
  schedule: () => sync.syncSchedule(),

  /** Kader aller 18 Vereine. 18 Aufrufe. */
  squads: (p) => sync.syncSquads(Number(p.get("limit") ?? 18)),

  /** Startmarktwerte aus der Vorsaison. ~38 Aufrufe, einmalig. */
  marketvalues: (p) =>
    sync.seedMarketValues(
      Number(p.get("season") ?? 2024),
      Number(p.get("limit") ?? 18),
      Number(p.get("pages") ?? 2),
    ),

  /** Spiele des Tagesfensters mit ihrer fixture-ID verknuepfen. 3 Aufrufe. */
  link: () => sync.linkTodaysFixtures(),

  /** Taegliche Marktwertanpassung samt Teamwert-Schnappschuss. Kostenlos. */
  prices: async () => ({
    kurse: await sync.updateMarketValues(),
    schnappschuesse: await sync.snapshotTeamValues(),
  }),

  /** Startwerte aus den gespeicherten Rohdaten neu rechnen. Kostenlos. */
  recalc: () => sync.recalcSeedValues(),

  /** Statistiken laufender und frisch abgepfiffener Spiele. 1 Aufruf je Spiel. */
  live: () => sync.syncLiveMatches(),
};

export const POST = handle(async (req: Request) => {
  requireAdmin(req);

  const params = new URL(req.url).searchParams;
  const job = params.get("job") ?? "";
  const runner = JOBS[job];
  if (!runner) {
    throw new HttpError(400, `Unbekannter Job "${job}". Moeglich: ${Object.keys(JOBS).join(", ")}`);
  }

  const startedAt = Date.now();
  const result = await runner(params);
  await prisma.syncState.upsert({
    where: { key: job },
    update: { lastRunAt: new Date() },
    create: { key: job, lastRunAt: new Date() },
  });

  return { job, result, dauerMs: Date.now() - startedAt };
});
