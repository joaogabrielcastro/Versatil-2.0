const hits = new Map<string, { count: number; resetAt: number }>();

const WINDOW_MS = 15 * 60 * 1000;
const MAX = 40;

export function checkLoginRateLimit(key: string): { ok: true } | { ok: false; retryAfterSec: number } {
  const now = Date.now();
  const row = hits.get(key);
  if (!row || now > row.resetAt) {
    hits.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { ok: true };
  }
  if (row.count >= MAX) {
    const retryAfterSec = Math.ceil((row.resetAt - now) / 1000);
    return { ok: false, retryAfterSec };
  }
  row.count += 1;
  return { ok: true };
}
