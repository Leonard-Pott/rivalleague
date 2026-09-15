// Handgepflegte Spiegelung der Server-Antworten.
// ponytail: doppelt gepflegt, shared package erst wenn die Typen auseinanderlaufen.

export type Me = {
  user: { id: string; name: string; image: string | null };
  leagues: LeagueSummary[];
};

export type LeagueSummary = {
  leagueId: string;
  name: string;
  inviteCode: string;
  managerId: string;
  teamName: string;
  budget: number;
};

export type TableRow = {
  rank: number;
  managerId: string;
  teamName: string;
  totalPoints: number;
  teamValue: number;
  budget: number;
  squadSize: number;
  isMe: boolean;
};

export type LeagueDetail = {
  league: {
    id: string;
    name: string;
    inviteCode: string;
    season: number;
    marketCloseHour: number;
  };
  me: {
    managerId: string;
    teamName: string;
    budget: number;
    verlauf: { date: string; teamValue: number; gesamt: number }[];
  };
  spieltag: { matchday: number; deadline: string | null; locked: boolean };
  table: TableRow[];
  syncHinweise: string[];
};

export type AuthResponse = {
  token: string;
  user: { id: string; name: string };
};

export type Position = "GK" | "DEF" | "MID" | "FWD";

export type SquadPlayer = {
  playerId: number;
  name: string;
  position: Position;
  photoUrl: string | null;
  team: { id: number; name: string; logoUrl: string | null };
  marketValue: number;
  boughtFor: number;
  gewinn: number;
  gesamtpunkte: number;
  schnitt: number | null;
  spieltage: number;
  letztePunkte: number | null;
  isStarter: boolean;
};

export type Squad = {
  matchday: number;
  teamName: string;
  budget: number;
  teamValue: number;
  kaderGroesse: number;
  spieler: SquadPlayer[];
};

export type LineupState = {
  matchday: number;
  deadline: string | null;
  locked: boolean;
  formationen: string[];
  formation: string | null;
  startelf: number[];
};

export type Offer = {
  listingId: string;
  playerId: number;
  name: string;
  position: Position;
  photoUrl: string | null;
  team: { id: number; name: string; logoUrl: string | null };
  marketValue: number;
  price: number;
  expiresAt: string;
  verkaeufer: { managerId: string; teamName: string } | null;
  istMeiner: boolean;
  letztePunkte: number[];
  meinGebot: number | null;
};

export type Market = {
  budget: number;
  gebunden: number;
  kaderGroesse: number;
  maxKader: number;
  angebote: Offer[];
};

export type ActivityEntry = {
  id: string;
  art: "transfer" | "angebot";
  zeit: string;
  playerId: number;
  name: string;
  position: Position;
  photoUrl: string | null;
  team: { id: number; name: string; logoUrl: string | null };
  preis: number;
  kaeufer: { managerId: string; teamName: string } | null;
  /** null = vom freien Markt. */
  verkaeufer: { managerId: string; teamName: string } | null;
  binIchBeteiligt: boolean;
  expiresAt: string | null;
};

export type Activity = { eintraege: ActivityEntry[] };

export type PlayerDetail = {
  playerId: number;
  name: string;
  position: Position;
  photoUrl: string | null;
  team: { id: number; name: string; logoUrl: string | null };
  marketValue: number;
  kursverlauf: { date: string; value: number }[];
  punkteVerlauf: {
    matchday: number;
    points: number;
    minuten: number | null;
    gegner: string | null;
    heimspiel: boolean | null;
    ergebnis: string | null;
  }[];
  gesamtpunkte: number;
  schnitt: number | null;
  wertGeschaetzt: boolean;
  besitzer: {
    managerId: string;
    teamName: string;
    istMeiner: boolean;
    boughtFor: number;
    gewinn: number;
  } | null;
  angebot: {
    listingId: string;
    price: number;
    expiresAt: string;
    meinGebot: number | null;
  } | null;
  naechstesSpiel: {
    matchday: number;
    kickoff: string;
    gegner: string;
    heimspiel: boolean;
  } | null;
};
