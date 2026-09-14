import { getRedis } from "@/lib/redis";

const WINDOW_MS = 15 * 60 * 1000;
const MAX = 40;

const memoryHits = new Map<string, { count: number; resetAt: number }>();

function memoryCheck(
  key: string,
): { ok: true } | { ok: false; retryAfterSec: number } {
  const now = Date.now();
  const row = memoryHits.get(key);
  if (!row || now > row.resetAt) {
    memoryHits.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { ok: true };
  }
  if (row.count >= MAX) {
    const retryAfterSec = Math.ceil((row.resetAt - now) / 1000);
    return { ok: false, retryAfterSec };
  }
  row.count += 1;
  return { ok: true };
}

export function checkLoginRateLimitMemory(
  key: string,
): { ok: true } | { ok: false; retryAfterSec: number } {
  return memoryCheck(key);
}

/** Rate limit distribuído (Redis). Fallback em memória se o Redis falhar. */
export async function checkLoginRateLimit(
  key: string,
): Promise<{ ok: true } | { ok: false; retryAfterSec: number }> {
  try {
    const redis = getRedis();
    const redisKey = `rl:login:${key}`;
    const n = await redis.incr(redisKey);
    if (n === 1) {
      await redis.pexpire(redisKey, WINDOW_MS);
    }
    if (n > MAX) {
      const ttl = await redis.pttl(redisKey);
      return {
        ok: false,
        retryAfterSec: Math.max(1, Math.ceil(Math.max(ttl, 0) / 1000)),
      };
    }
    return { ok: true };
  } catch {
    return memoryCheck(key);
  }
}

export const LOGIN_RATE_LIMIT_MAX = MAX;
export const LOGIN_RATE_LIMIT_WINDOW_MS = WINDOW_MS;
