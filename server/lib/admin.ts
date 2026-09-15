import { HttpError } from "./guards";

/**
 * Die Admin-Endpunkte stossen Datenimporte an und koennen Punkte ueberschreiben.
 * Sie haengen bewusst nicht am normalen Nutzer-Token: ein Manager der Liga
 * soll den Spielbetrieb nicht umschreiben koennen.
 */
export function requireAdmin(req: Request): void {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) {
    throw new HttpError(500, "ADMIN_TOKEN ist nicht gesetzt");
  }
  const given = req.headers.get("x-admin-token");
  if (given !== expected) {
    throw new HttpError(401, "Falsches Admin-Token");
  }
}
