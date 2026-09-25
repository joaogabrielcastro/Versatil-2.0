import { describe, expect, it } from "vitest";
import {
  billablePeriodsForSubscription,
  periodDueAt,
  subscriptionIdempotencyKey,
} from "@/lib/billing/period";
import { suggestedSubscriptionEnd } from "@/lib/billing/term-end";
import { isSubscriptionActiveAt } from "@/lib/services/student-status-logic";

describe("billing period", () => {
  it("gera chave pela data civil de São Paulo", () => {
    const due = new Date("2026-03-01T02:30:00.000Z");
    expect(subscriptionIdempotencyKey("sub-1", due)).toBe("sub:sub-1:2026-02-28");
  });

  it("31 de janeiro cai no último dia de fevereiro e o ciclo seguinte volta ao dia 31", () => {
    const start = new Date("2026-01-31T15:00:00.000Z");
    expect(periodDueAt(start, "monthly", 1).toISOString()).toBe(
      "2026-02-28T15:00:00.000Z",
    );
    expect(periodDueAt(start, "monthly", 2).toISOString()).toBe(
      "2026-03-31T15:00:00.000Z",
    );
  });

  it("respeita 29 de fevereiro em ano bissexto", () => {
    const start = new Date("2024-01-31T15:00:00.000Z");
    expect(periodDueAt(start, "monthly", 1).toISOString()).toBe(
      "2024-02-29T15:00:00.000Z",
    );
  });

  it("recupera ciclos vencidos dentro da vigência e não passa de endsAt", () => {
    const startsAt = new Date("2026-01-15T15:00:00.000Z");
    const now = new Date("2026-04-01T15:00:00.000Z");
    const periods = billablePeriodsForSubscription(
      "sub-abc",
      startsAt,
      new Date("2026-03-20T15:00:00.000Z"),
      "monthly",
      now,
      7,
    );
    expect(periods.map((period) => period.idempotencyKey)).toEqual([
      "sub:sub-abc:2026-01-15",
      "sub:sub-abc:2026-02-15",
      "sub:sub-abc:2026-03-15",
    ]);
  });

  it("não gera o próximo ciclo fora da janela de 7 dias", () => {
    const startsAt = new Date("2026-01-15T15:00:00.000Z");
    const now = new Date("2026-02-01T15:00:00.000Z");
    const periods = billablePeriodsForSubscription(
      "sub-abc",
      startsAt,
      null,
      "monthly",
      now,
      7,
    );
    expect(periods.map((period) => period.idempotencyKey)).toEqual([
      "sub:sub-abc:2026-01-15",
    ]);
  });

  it("trimestral avança três meses", () => {
    const start = new Date("2026-01-15T15:00:00.000Z");
    expect(periodDueAt(start, "quarterly", 1).toISOString()).toBe(
      "2026-04-15T15:00:00.000Z",
    );
  });

  it("plano mensal de 3 meses gera exatamente três parcelas e cobre o último dia inteiro", () => {
    const startsAt = new Date("2026-01-15T15:00:00.000Z");
    const endsAt = suggestedSubscriptionEnd(startsAt, "monthly", 3);
    expect(endsAt?.toISOString()).toBe("2026-04-15T02:59:59.999Z");
    const periods = billablePeriodsForSubscription(
      "sub-term",
      startsAt,
      endsAt,
      "monthly",
      new Date("2026-12-01T15:00:00.000Z"),
    );
    expect(periods.map((period) => period.idempotencyKey)).toEqual([
      "sub:sub-term:2026-01-15",
      "sub:sub-term:2026-02-15",
      "sub:sub-term:2026-03-15",
    ]);
    expect(isSubscriptionActiveAt(startsAt, endsAt, new Date("2026-04-15T02:59:59.999Z"))).toBe(
      true,
    );
    expect(isSubscriptionActiveAt(startsAt, endsAt, new Date("2026-04-15T03:00:00.000Z"))).toBe(
      false,
    );
  });

  it("trimestral à vista gera uma cobrança e cobre até o fim do dia anterior ao próximo ciclo", () => {
    const startsAt = new Date("2026-01-15T15:00:00.000Z");
    const endsAt = suggestedSubscriptionEnd(startsAt, "quarterly", 3);
    expect(endsAt?.toISOString()).toBe("2026-04-15T02:59:59.999Z");
    const periods = billablePeriodsForSubscription(
      "sub-upfront",
      startsAt,
      endsAt,
      "quarterly",
      new Date("2027-01-01T15:00:00.000Z"),
    );
    expect(periods.map((period) => period.idempotencyKey)).toEqual([
      "sub:sub-upfront:2026-01-15",
    ]);
  });

  it("prazo a partir do dia 31 não cria a cobrança seguinte e respeita fevereiro bissexto", () => {
    const start = new Date("2026-01-31T15:00:00.000Z");
    const endsAt = suggestedSubscriptionEnd(start, "monthly", 3);
    expect(endsAt?.toISOString()).toBe("2026-04-30T02:59:59.999Z");
    expect(
      billablePeriodsForSubscription(
        "sub-31",
        start,
        endsAt,
        "monthly",
        new Date("2026-12-01T15:00:00.000Z"),
      ).map((period) => period.idempotencyKey),
    ).toEqual(["sub:sub-31:2026-01-31", "sub:sub-31:2026-02-28", "sub:sub-31:2026-03-31"]);

    const leap = new Date("2024-01-31T15:00:00.000Z");
    const leapEnd = suggestedSubscriptionEnd(leap, "quarterly", 3);
    expect(periodDueAt(leap, "monthly", 1).toISOString()).toBe("2024-02-29T15:00:00.000Z");
    expect(leapEnd?.toISOString()).toBe("2024-04-30T02:59:59.999Z");
    expect(
      billablePeriodsForSubscription(
        "sub-leap",
        leap,
        leapEnd,
        "quarterly",
        new Date("2024-12-01T15:00:00.000Z"),
      ),
    ).toHaveLength(1);
  });

  it("plano sem prazo não sugere término", () => {
    const startsAt = new Date("2026-01-15T15:00:00.000Z");
    expect(suggestedSubscriptionEnd(startsAt, "monthly", null)).toBeNull();
  });

  it("reexecução devolve as mesmas chaves", () => {
    const startsAt = new Date("2026-01-10T15:00:00.000Z");
    const now = new Date("2026-03-10T15:00:00.000Z");
    const first = billablePeriodsForSubscription("s", startsAt, null, "monthly", now);
    const second = billablePeriodsForSubscription("s", startsAt, null, "monthly", now);
    expect(second.map((period) => period.idempotencyKey)).toEqual(
      first.map((period) => period.idempotencyKey),
    );
    expect(first).toHaveLength(3);
  });
});
