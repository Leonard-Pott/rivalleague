/**
 * Bewusst ohne Imports, damit der Selbsttest nichts hochfahren muss.
 * Kein Parameter-Property-Zucker - Nodes Type-Stripping kann das nicht.
 */
export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/**
 * Sperrt Entwicklungs-Endpunkte in Produktion. Der Dev-Login stellt ohne
 * jede Pruefung ein Token fuer einen beliebigen Namen aus - waere er in
 * Produktion erreichbar, koennte jeder jeden Account uebernehmen.
 */
export function devOnly(nodeEnv: string | undefined = process.env.NODE_ENV) {
  if (nodeEnv === "production") throw new HttpError(404, "Not found");
}
