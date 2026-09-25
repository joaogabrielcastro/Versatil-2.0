import { getRedis } from "@/lib/redis";

const WINDOW_MS = 60_000;
const MAX = 20;
const memoryHits = new Map<string, { count: number; resetAt: number }>();

export function checkTurnstileRateLimitMemory(
  key: string,
  now = Date.now(),
  max = MAX,
  windowMs = WINDOW_MS,
): { ok: true } | { ok: false; retryAfterSec: number } {
  const row = memoryHits.get(key);
  if (!row || now > row.resetAt) {
    memoryHits.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true };
  }
  if (row.count >= max) {
    return { ok: false, retryAfterSec: Math.ceil((row.resetAt - now) / 1000) };
  }
  row.count += 1;
  return { ok: true };
}

export async function checkTurnstileRateLimit(
  deviceKey: string,
): Promise<{ ok: true } | { ok: false; retryAfterSec: number }> {
  try {
    const redis = getRedis();
    const redisKey = `rl:turnstile:${deviceKey}`;
    const n = await redis.incr(redisKey);
    if (n === 1) await redis.pexpire(redisKey, WINDOW_MS);
    if (n > MAX) {
      const ttl = await redis.pttl(redisKey);
      return { ok: false, retryAfterSec: Math.max(1, Math.ceil(Math.max(ttl, 0) / 1000)) };
    }
    return { ok: true };
  } catch {
    return checkTurnstileRateLimitMemory(deviceKey);
  }
}

export const TURNSTILE_RATE_LIMIT_MAX = MAX;
