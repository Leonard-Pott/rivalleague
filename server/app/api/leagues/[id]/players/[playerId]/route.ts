import { prisma } from "@/lib/db";
import { requireManager } from "@/lib/auth";
import { HttpError } from "@/lib/guards";
import { handle } from "@/lib/http";

type Ctx = { params: Promise<{ id: string; playerId: string }> };

/**
 * Spielerdetail im Kontext einer Liga: Kursverlauf, Punkte je Spieltag und
 * wem er gerade gehoert. Der Ligabezug ist noetig, weil derselbe Spieler in
 * jeder Liga jemand anderem gehoeren kann.
 */
export const GET = handle(async (req: Request, ctx: Ctx) => {
  const { id: leagueId, playerId: raw } = await ctx.params;
  const me = await requireManager(req, leagueId);

  const playerId = Number(raw);
  if (!Number.isInteger(playerId)) throw new HttpError(400, "Ungueltige Spieler-ID");

  const player = await prisma.player.findUnique({
    where: { id: playerId },
    include: {
      team: { select: { id: true, name: true, logoUrl: true } },
      values: { orderBy: { date: "asc" }, take: 60 },
      points: { orderBy: { matchday: "asc" } },
    },
  });
  if (!player) throw new HttpError(404, "Spieler nicht gefunden");

  const roster = await prisma.roster.findUnique({
    where: { leagueId_playerId: { leagueId, playerId } },
    include: { manager: { select: { id: true, teamName: true } } },
  });

  const listing = await prisma.listing.findFirst({
    where: { leagueId, playerId, resolvedAt: null },
    include: { bids: { where: { managerId: me.id } } },
  });

  // Alle Partien des Vereins auf einmal: daraus faellt sowohl der Gegner je
  // gespieltem Spieltag ab als auch das naechste Spiel. Zwei Abfragen waeren
  // dieselbe Tabelle zweimal.
  const spiele = await prisma.match.findMany({
    where: { OR: [{ homeTeamId: player.teamId }, { awayTeamId: player.teamId }] },
    orderBy: { kickoff: "asc" },
    include: {
      home: { select: { name: true } },
      away: { select: { name: true } },
    },
  });

  const gegnerAm = new Map(
    spiele.map((m) => {
      const heimspiel = m.homeTeamId === player.teamId;
      return [
        m.matchday,
        {
          gegner: heimspiel ? m.away.name : m.home.name,
          heimspiel,
          ergebnis:
            m.homeGoals === null || m.awayGoals === null
              ? null
              : heimspiel
                ? `${m.homeGoals}:${m.awayGoals}`
                : `${m.awayGoals}:${m.homeGoals}`,
        },
      ];
    }),
  );
  const naechstesSpiel = spiele.find((m) => !m.finished) ?? null;

  const punkte = player.points.map((p) => p.points);

  return {
    playerId: player.id,
    name: player.name,
    position: player.position,
    photoUrl: player.photoUrl,
    team: player.team,
    marketValue: player.marketValue,
    /** Aelteste zuerst - so kann die App direkt eine Linie daraus zeichnen. */
    kursverlauf: player.values.map((v) => ({
      date: v.date.toISOString().slice(0, 10),
      value: v.value,
    })),
    /** Ein Eintrag je bestrittenem Spiel, aelteste zuerst. */
    punkteVerlauf: player.points.map((p) => ({
      matchday: p.matchday,
      points: p.points,
      minuten: (p.statsJson as { minutes?: number } | null)?.minutes ?? null,
      ...(gegnerAm.get(p.matchday) ?? { gegner: null, heimspiel: null, ergebnis: null }),
    })),
    gesamtpunkte: punkte.reduce((s, p) => s + p, 0),
    schnitt: punkte.length ? Math.round(punkte.reduce((s, p) => s + p, 0) / punkte.length) : null,
    /** Ohne Vorsaisondaten ist der Startwert nur geschaetzt - das gehoert dazugesagt. */
    wertGeschaetzt: player.seedStats === null,
    besitzer: roster
      ? {
          managerId: roster.manager.id,
          teamName: roster.manager.teamName,
          istMeiner: roster.managerId === me.id,
          boughtFor: roster.boughtFor,
          gewinn: player.marketValue - roster.boughtFor,
        }
      : null,
    angebot: listing
      ? {
          listingId: listing.id,
          price: listing.price,
          expiresAt: listing.expiresAt,
          meinGebot: listing.bids[0]?.amount ?? null,
        }
      : null,
    naechstesSpiel: naechstesSpiel
      ? {
          matchday: naechstesSpiel.matchday,
          kickoff: naechstesSpiel.kickoff,
          gegner:
            naechstesSpiel.homeTeamId === player.teamId
              ? naechstesSpiel.away.name
              : naechstesSpiel.home.name,
          heimspiel: naechstesSpiel.homeTeamId === player.teamId,
        }
      : null,
  };
});
