import { describe, expect, it } from "vitest";
import {
  billablePeriodsForSubscription,
  periodDueAt,
  subscriptionIdempotencyKey,
} from "@/lib/billing/period";

describe("billing period", () => {
  it("gera chave de idempotência estável por dia", () => {
    const due = new Date("2026-03-01T12:00:00.000Z");
    expect(subscriptionIdempotencyKey("sub-1", due)).toBe(
      "sub:sub-1:2026-03-01",
    );
  });

  it("calcula vencimento mensal", () => {
    const start = new Date("2026-01-15T10:00:00.000Z");
    const due = periodDueAt(start, "monthly", 1);
    expect(due.getMonth()).toBe(1);
  });

  it("limita períodos ao horizonte", () => {
    const startsAt = new Date("2026-01-01T00:00:00.000Z");
    const now = new Date("2026-01-01T00:00:00.000Z");
    const periods = billablePeriodsForSubscription(
      "sub-abc",
      startsAt,
      null,
      "monthly",
      now,
      7,
    );
    expect(periods.length).toBeGreaterThan(0);
    expect(periods.length).toBeLessThanOrEqual(2);
  });
});
