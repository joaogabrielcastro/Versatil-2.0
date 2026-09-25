import { describe, expect, it } from "vitest";
import {
  billablePeriodsForSubscription,
  periodDueAt,
  subscriptionIdempotencyKey,
} from "@/lib/billing/period";

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
