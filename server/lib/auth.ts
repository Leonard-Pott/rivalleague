import { SignJWT, jwtVerify } from "jose";
import { prisma } from "./db";
import { HttpError } from "./guards";

export { HttpError };

/**
 * Ohne gesetztes Secret signiert der Server mit einem Wert, der im
 * Quelltext steht - jeder koennte sich dann ein gueltiges Token fuer einen
 * fremden Account selbst ausstellen. In der Entwicklung ist das bequem, in
 * Produktion waere es dasselbe wie gar keine Anmeldung, also: Abbruch.
 */
function secretBytes(): Uint8Array {
  const value = process.env.JWT_SECRET;
  if (value) return new TextEncoder().encode(value);
  if (process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET fehlt - ohne Secret wird nicht signiert");
  }
  return new TextEncoder().encode("insecure-fallback-dev-only");
}

export async function signToken(userId: string): Promise<string> {
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("180d") // Handy-App, die Saison soll durchhalten
    .sign(secretBytes());
}

/** Liest den Bearer-Token. Gibt die userId zurueck oder null. */
export async function userIdFromRequest(req: Request): Promise<string | null> {
  const header = req.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  try {
    const { payload } = await jwtVerify(header.slice(7), secretBytes());
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

export async function requireUser(req: Request) {
  const userId = await userIdFromRequest(req);
  if (!userId) throw new HttpError(401, "Nicht angemeldet");
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new HttpError(401, "Nutzer existiert nicht mehr");
  return user;
}

/**
 * Jeder Liga-Endpunkt geht hier durch. Prueft in einem Schritt, dass der Nutzer
 * angemeldet ist UND wirklich Manager dieser Liga - ohne das koennte jeder mit
 * einem gueltigen Token jede fremde Liga auslesen.
 */
export async function requireManager(req: Request, leagueId: string) {
  const user = await requireUser(req);
  const manager = await prisma.manager.findUnique({
    where: { userId_leagueId: { userId: user.id, leagueId } },
    include: { league: true },
  });
  if (!manager) throw new HttpError(403, "Du bist kein Manager in dieser Liga");
  return manager;
}
