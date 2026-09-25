import { describe, expect, it } from "vitest";
import { gateHttpResult, PUBLIC_ACCESS_DENIAL } from "@/lib/access/gate";
import { checkTurnstileRateLimitMemory } from "@/lib/access/rate-limit";

describe("gateHttpResult", () => {
  it("não abre quando a dependência falha ou o acesso é negado", () => {
    expect(gateHttpResult("unavailable")).toEqual({
      status: 503,
      body: { open: false, message: PUBLIC_ACCESS_DENIAL },
    });
    const denied = gateHttpResult("deny");
    expect(denied.body.open).toBe(false);
    expect(denied.body.message).toBe(PUBLIC_ACCESS_DENIAL);
    expect(JSON.stringify(denied)).not.toMatch(/inadimplente|não encontrado/i);
  });

  it("abre só no caso explícito de liberação", () => {
    expect(gateHttpResult("allow")).toEqual({ status: 200, body: { open: true } });
  });
});

describe("checkTurnstileRateLimitMemory", () => {
  it("bloqueia a tentativa seguinte depois do limite", () => {
    const key = `dev-${Date.now()}`;
    const now = 1_700_000_000_000;
    for (let i = 0; i < 3; i++) {
      expect(checkTurnstileRateLimitMemory(key, now, 3, 60_000).ok).toBe(true);
    }
    const blocked = checkTurnstileRateLimitMemory(key, now, 3, 60_000);
    expect(blocked.ok).toBe(false);
  });
});
