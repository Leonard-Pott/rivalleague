/**
 * OpenLigaDB liefert den kompletten Spielplan der laufenden Saison - ohne
 * Schluessel, ohne Registrierung, ohne Tageslimit. Genau das, was der
 * Free-Tier von API-Football sperrt.
 *
 * Umgekehrt hat OpenLigaDB keine Kader und keine Spielerstatistiken. Die
 * beiden Quellen ergaenzen sich, deshalb liegen sie in getrennten Dateien.
 */
const BASE = "https://api.openligadb.de";
const LEAGUE = "bl1";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`OpenLigaDB ${res.status} bei ${path}`);
  return (await res.json()) as T;
}

export type OpenLigaTeam = { teamId: number; teamName: string };

export async function fetchTeams(season: number): Promise<OpenLigaTeam[]> {
  return get<OpenLigaTeam[]>(`/getavailableteams/${LEAGUE}/${season}`);
}

export type OpenLigaMatch = {
  matchId: number;
  matchday: number;
  kickoff: Date;
  homeOpenligaId: number;
  awayOpenligaId: number;
  finished: boolean;
  homeGoals: number | null;
  awayGoals: number | null;
};

type RawMatch = {
  matchID: number;
  matchDateTimeUTC: string;
  matchIsFinished: boolean;
  group: { groupOrderID: number };
  team1: { teamId: number };
  team2: { teamId: number };
  matchResults: { resultTypeID: number; pointsTeam1: number; pointsTeam2: number }[];
};

/** Endergebnis ist resultTypeID 2; 1 ist die Halbzeit. */
function finalResult(m: RawMatch) {
  return m.matchResults.find((r) => r.resultTypeID === 2) ?? null;
}

export async function fetchSeasonMatches(season: number): Promise<OpenLigaMatch[]> {
  const raw = await get<RawMatch[]>(`/getmatchdata/${LEAGUE}/${season}`);
  return raw.map((m) => {
    const result = finalResult(m);
    return {
      matchId: m.matchID,
      matchday: m.group.groupOrderID,
      kickoff: new Date(m.matchDateTimeUTC),
      homeOpenligaId: m.team1.teamId,
      awayOpenligaId: m.team2.teamId,
      finished: m.matchIsFinished,
      homeGoals: result ? result.pointsTeam1 : null,
      awayGoals: result ? result.pointsTeam2 : null,
    };
  });
}

/**
 * Aendert sich der Spielplan (Verlegungen, Ergebnisse), springt dieser
 * Zeitstempel. Ein Abgleich kostet einen winzigen Aufruf statt 306 Spiele.
 */
export async function lastChange(season: number, matchday: number): Promise<Date> {
  const raw = await get<string>(`/getlastchangedate/${LEAGUE}/${season}/${matchday}`);
  return new Date(raw);
}
