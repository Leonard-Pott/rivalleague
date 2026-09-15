import { API_BASE } from "./config";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function api<T>(
  path: string,
  opts: { token?: string | null; method?: string; body?: unknown } = {},
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: opts.method ?? (opts.body ? "POST" : "GET"),
    headers: {
      ...(opts.body ? { "content-type": "application/json" } : {}),
      ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new ApiError(res.status, data?.error ?? `Fehler ${res.status}`);
  }
  return data as T;
}

/** 12.345.678 statt 12345678 - Betraege in dieser App sind immer sechsstellig aufwaerts. */
export function euro(value: number): string {
  return `${value.toLocaleString("de-DE")} €`;
}

/** Kompakt fuer Tabellen: 12,3 Mio. */
export function euroShort(value: number): string {
  if (Math.abs(value) >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1).replace(".", ",")} Mio`;
  }
  return `${Math.round(value / 1000)} Tsd`;
}
