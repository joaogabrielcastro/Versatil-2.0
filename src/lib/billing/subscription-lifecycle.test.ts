import { describe, expect, it } from "vitest";
import {
  invoicesToVoid,
  nextCycleDue,
  paidPeriodEnd,
} from "@/lib/billing/subscription-lifecycle";

const noon = (iso: string) => new Date(`${iso}T15:00:00.000Z`);

describe("ciclo de assinatura", () => {
  it("cancela no fim do período pago vigente", () => {
    const end = paidPeriodEnd(noon("2026-01-20"), [
      { dueAt: noon("2026-01-15"), interval: "monthly" },
    ]);
    expect(end?.toISOString()).toBe("2026-02-15T02:59:59.999Z");
  });

  it("o trimestral à vista cobre até o fim do dia anterior à próxima cobrança", () => {
    const end = paidPeriodEnd(noon("2026-09-25"), [
      { dueAt: noon("2026-09-25"), interval: "quarterly" },
    ]);
    expect(end?.toISOString()).toBe("2026-12-25T02:59:59.999Z");
    expect(
      paidPeriodEnd(noon("2026-12-25"), [
        { dueAt: noon("2026-09-25"), interval: "quarterly" },
      ]),
    ).toBeNull();
  });

  it("sem período pago vigente o cancelamento é imediato", () => {
    expect(
      paidPeriodEnd(noon("2026-03-01"), [
        { dueAt: noon("2026-01-15"), interval: "monthly" },
      ]),
    ).toBeNull();
  });

  it("não trata buraco entre faturas como pago", () => {
    expect(
      paidPeriodEnd(noon("2026-02-20"), [
        { dueAt: noon("2026-01-15"), interval: "monthly" },
        { dueAt: noon("2026-03-15"), interval: "monthly" },
      ]),
    ).toBeNull();
  });

  it("anula fatura futura sem POS e trava se qualquer aberta está pendente", () => {
    const result = invoicesToVoid(noon("2026-02-15"), [
      { id: "past", dueAt: noon("2026-01-15"), gatewayChargeStatus: "idle" },
      { id: "past-pos", dueAt: noon("2026-01-15"), gatewayChargeStatus: "pending" },
      { id: "future", dueAt: noon("2026-02-15"), gatewayChargeStatus: "idle" },
      { id: "pos", dueAt: noon("2026-03-15"), gatewayChargeStatus: "pending" },
    ]);
    expect(result.voidIds).toEqual(["future"]);
    expect(result.blockedByPos).toEqual(["past-pos", "pos"]);
  });

  it("troca vale no próximo ciclo e não passa de endsAt", () => {
    expect(
      nextCycleDue(noon("2026-01-31"), "monthly", noon("2026-01-31"), null)?.toISOString(),
    ).toBe("2026-02-28T15:00:00.000Z");
    expect(
      nextCycleDue(noon("2026-01-15"), "monthly", noon("2026-01-20"), noon("2026-01-20")),
    ).toBeNull();
  });
});
