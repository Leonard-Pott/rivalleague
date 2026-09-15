import { HttpError } from "./guards";

/** Kapselt Route-Handler, damit HttpError nicht in jeder Route einzeln behandelt wird. */
export function handle<T extends unknown[]>(
  fn: (req: Request, ...args: T) => Promise<unknown>,
) {
  return async (req: Request, ...args: T) => {
    try {
      const result = await fn(req, ...args);
      // Redirects (OAuth-Callback) muessen unveraendert durch, nicht als JSON.
      return result instanceof Response ? result : Response.json(result);
    } catch (err) {
      if (err instanceof HttpError) {
        return Response.json({ error: err.message }, { status: err.status });
      }
      console.error(err);
      return Response.json({ error: "Interner Fehler" }, { status: 500 });
    }
  };
}
