import { describe, expect, it } from "vitest";
import {
  MAX_CHARGE_ATTEMPTS,
  computeNextChargeAttempt,
  isChargeableNow,
  nextStateAfterPaymentFailed,
} from "@/lib/payments/recurring";

const day = 86_400_000;
const base = new Date("2026-01-01T00:00:00.000Z");

describe("computeNextChargeAttempt", () => {
  it("aplica backoff crescente 1/3/7 dias", () => {
    expect(computeNextChargeAttempt(1, base)!.getTime()).toBe(base.getTime() + 1 * day);
    expect(computeNextChargeAttempt(2, base)!.getTime()).toBe(base.getTime() + 3 * day);
    expect(computeNextChargeAttempt(3, base)!.getTime()).toBe(base.getTime() + 7 * day);
  });

  it("retorna null ao esgotar tentativas", () => {
    expect(computeNextChargeAttempt(MAX_CHARGE_ATTEMPTS, base)).toBeNull();
    expect(computeNextChargeAttempt(MAX_CHARGE_ATTEMPTS + 2, base)).toBeNull();
  });
});

describe("isChargeableNow", () => {
  const now = base;
  it("cobra fatura aberta sem agendamento", () => {
    expect(
      isChargeableNow({ status: "open", chargeAttempts: 0, nextChargeAttemptAt: null, now }),
    ).toBe(true);
  });

  it("não cobra fatura não aberta", () => {
    expect(
      isChargeableNow({ status: "paid", chargeAttempts: 0, nextChargeAttemptAt: null, now }),
    ).toBe(false);
  });

  it("respeita backoff futuro", () => {
    expect(
      isChargeableNow({
        status: "open",
        chargeAttempts: 1,
        nextChargeAttemptAt: new Date(now.getTime() + day),
        now,
      }),
    ).toBe(false);
    expect(
      isChargeableNow({
        status: "open",
        chargeAttempts: 1,
        nextChargeAttemptAt: new Date(now.getTime() - day),
        now,
      }),
    ).toBe(true);
  });

  it("desiste após o máximo de tentativas", () => {
    expect(
      isChargeableNow({
        status: "open",
        chargeAttempts: MAX_CHARGE_ATTEMPTS,
        nextChargeAttemptAt: null,
        now,
      }),
    ).toBe(false);
  });
});

describe("nextStateAfterPaymentFailed", () => {
  it("mantém fatura aberta na primeira falha e agenda retry", () => {
    const next = nextStateAfterPaymentFailed({
      invoiceStatus: "open",
      chargeAttempts: 1,
      now: base,
    });
    expect(next.skip).toBe(false);
    expect(next.invoiceStatus).toBe("open");
    expect(next.gatewayChargeStatus).toBe("failed");
    expect(next.nextChargeAttemptAt?.getTime()).toBe(base.getTime() + day);
  });

  it("só marca uncollectible após esgotar tentativas", () => {
    const next = nextStateAfterPaymentFailed({
      invoiceStatus: "open",
      chargeAttempts: MAX_CHARGE_ATTEMPTS,
      now: base,
    });
    expect(next.invoiceStatus).toBe("uncollectible");
    expect(next.nextChargeAttemptAt).toBeNull();
  });
});
