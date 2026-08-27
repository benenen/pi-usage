/** Shared fetch + formatting helpers. */

const TIMEOUT_MS = 10_000;

export async function getJson(url: string, key: string): Promise<any | null> {
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** "reset 4h23m" style countdown, or null when missing/expired. */
export function fmtEta(resetAtMs?: number): string | null {
  if (typeof resetAtMs !== "number") return null;
  const ms = resetAtMs - Date.now();
  if (Number.isNaN(ms) || ms <= 0) return null;
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h > 0 ? `reset ${h}h${m}m` : `reset ${m}m`;
}

export function pct(n: number | undefined): number | null {
  return typeof n === "number" ? Math.round(n) : null;
}
