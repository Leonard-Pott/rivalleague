import { test } from "node:test";
import assert from "node:assert/strict";
import { matchTeams, normalize, similarity } from "./match-teams.ts";

// Echte Namen beider Quellen, Saison 2026/27. Der Abgleich muss alle 18
// treffen - sonst fehlen Spieler oder Punkte landen beim falschen Verein.
const OPENLIGA = [
  { teamId: 40, teamName: "FC Bayern München" },
  { teamId: 7, teamName: "Borussia Dortmund" },
  { teamId: 9, teamName: "VfB Stuttgart" },
  { teamId: 6, teamName: "Bayer 04 Leverkusen" },
  { teamId: 87, teamName: "Borussia Mönchengladbach" },
  { teamId: 91, teamName: "SC Freiburg" },
  { teamId: 131, teamName: "1. FC Union Berlin" },
  { teamId: 175, teamName: "RB Leipzig" },
  { teamId: 81, teamName: "1. FSV Mainz 05" },
  { teamId: 55, teamName: "SV Werder Bremen" },
  { teamId: 95, teamName: "FC Augsburg" },
  { teamId: 112, teamName: "TSG Hoffenheim" },
  { teamId: 134, teamName: "Eintracht Frankfurt" },
  { teamId: 65, teamName: "1. FC Köln" },
  { teamId: 100, teamName: "FC Schalke 04" },
  { teamId: 185, teamName: "Hamburger SV" },
  { teamId: 129, teamName: "SC Paderborn 07" },
  { teamId: 1635, teamName: "SV 07 Elversberg" },
];

const API_FOOTBALL = [
  { id: 157, name: "Bayern München" },
  { id: 165, name: "Borussia Dortmund" },
  { id: 172, name: "VfB Stuttgart" },
  { id: 168, name: "Bayer Leverkusen" },
  { id: 163, name: "Borussia Mönchengladbach" },
  { id: 160, name: "SC Freiburg" },
  { id: 182, name: "Union Berlin" },
  { id: 173, name: "RB Leipzig" },
  { id: 164, name: "FSV Mainz 05" },
  { id: 162, name: "Werder Bremen" },
  { id: 170, name: "FC Augsburg" },
  { id: 167, name: "1899 Hoffenheim" },
  { id: 169, name: "Eintracht Frankfurt" },
  { id: 192, name: "1. FC Köln" },
  { id: 174, name: "FC Schalke 04" },
  { id: 175, name: "Hamburger SV" },
  { id: 185, name: "SC Paderborn 07" },
  { id: 1660, name: "SV Elversberg" },
  // Stoerfeuer: 1200 weitere deutsche Vereine liefert der Anbieter mit,
  // darunter Namensvettern aus unteren Ligen.
  { id: 9999, name: "Bayern München II" },
  { id: 9998, name: "Borussia Dortmund II" },
  { id: 9997, name: "1. FC Köln II" },
  { id: 9996, name: "SV Werder Bremen II" },
  { id: 9995, name: "Hamburger SV III" },
];

test("alle 18 Bundesligavereine werden zugeordnet", () => {
  const { matched, unmatched } = matchTeams(OPENLIGA, API_FOOTBALL);
  assert.deepEqual(unmatched, [], "kein Verein darf offen bleiben");
  assert.equal(matched.length, 18);
});

test("kein API-Verein wird doppelt vergeben", () => {
  const { matched } = matchTeams(OPENLIGA, API_FOOTBALL);
  assert.equal(new Set(matched.map((m) => m.teamId)).size, matched.length);
});

test("die erwarteten Paare kommen heraus", () => {
  const { matched } = matchTeams(OPENLIGA, API_FOOTBALL);
  const byOpenliga = new Map(matched.map((m) => [m.openligaId, m.teamId]));
  assert.equal(byOpenliga.get(40), 157, "Bayern");
  assert.equal(byOpenliga.get(131), 182, "Union Berlin trotz fehlendem 1. FC");
  assert.equal(byOpenliga.get(112), 167, "TSG Hoffenheim = 1899 Hoffenheim");
  assert.equal(byOpenliga.get(1635), 1660, "SV 07 Elversberg = SV Elversberg");
  assert.equal(byOpenliga.get(65), 192, "1. FC Köln, nicht die Zweitvertretung");
  assert.equal(byOpenliga.get(55), 162, "Werder Bremen, nicht Werder Bremen II");
});

test("unbekannter Aufsteiger wird gemeldet statt geraten", () => {
  const { matched, unmatched } = matchTeams(
    [{ teamId: 1, teamName: "Kickers Wanne-Eickel" }],
    [{ id: 157, name: "Bayern München" }],
  );
  assert.deepEqual(matched, []);
  assert.equal(unmatched.length, 1);
  assert.equal(unmatched[0].openligaName, "Kickers Wanne-Eickel");
});

test("Normalisierung entschaerft Umlaute und Vereinskuerzel", () => {
  assert.equal(normalize("FC Bayern München"), normalize("Bayern Munchen"));
  assert.equal(normalize("1. FC Union Berlin"), normalize("Union Berlin"));
  assert.equal(normalize("SV Werder Bremen"), normalize("Werder Bremen"));
});

test("Aehnlichkeit unterscheidet Erst- und Zweitvertretung", () => {
  const bremen = normalize("SV Werder Bremen");
  assert.ok(
    similarity(bremen, normalize("Werder Bremen")) >
      similarity(bremen, normalize("SV Werder Bremen II")),
  );
});
