import { describe, expect, it } from "vitest";
import {
  LOGIN_RATE_LIMIT_MAX,
  checkLoginRateLimitMemory,
} from "@/lib/auth/login-rate-limit";

describe("login rate limit (memória)", () => {
  it("permite tentativas abaixo do limite e bloqueia depois", () => {
    const key = `test-${Date.now()}-${Math.random()}`;
    for (let i = 0; i < LOGIN_RATE_LIMIT_MAX; i += 1) {
      expect(checkLoginRateLimitMemory(key).ok).toBe(true);
    }
    const blocked = checkLoginRateLimitMemory(key);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.retryAfterSec).toBeGreaterThan(0);
  });
});
