import { describe, expect, it } from "vitest";
import { endOfPreviousCivilDay, periodDueAt } from "@/lib/billing/period";
import { suggestedSubscriptionEnd } from "@/lib/billing/term-end";
import {
  decideCoverage,
  renewalChargePeriods,
  renewalStartsAt,
} from "@/lib/billing/renewal-billing";

const noon = (iso: string) => new Date(`${iso}T15:00:00.000Z`);

describe("início da renovação", () => {
  it("começa no instante seguinte ao fim inclusivo, sem sobrepor o dia coberto", () => {
    const previousEnd = new Date("2026-12-25T02:59:59.999Z");
    const start = renewalStartsAt(previousEnd);
    expect(start.toISOString()).toBe("2026-12-25T03:00:00.000Z");
    expect(start.getTime()).toBeGreaterThan(previousEnd.getTime());
    expect(periodDueAt(start, "monthly", 0).toISOString()).toBe("2026-12-25T15:00:00.000Z");
  });

  it("no dia 31 o primeiro vencimento é o dia seguinte ao último dia coberto", () => {
    const contractEnd = suggestedSubscriptionEnd(noon("2026-01-31"), "monthly", 1);
    expect(contractEnd?.toISOString()).toBe("2026-02-28T02:59:59.999Z");
    const start = renewalStartsAt(contractEnd!);
    expect(start.toISOString()).toBe("2026-02-28T03:00:00.000Z");
    expect(periodDueAt(start, "monthly", 0).toISOString()).toBe("2026-02-28T15:00:00.000Z");
  });

  it("no ano bissexto o vencimento cai em 29 de fevereiro", () => {
    const contractEnd = suggestedSubscriptionEnd(noon("2024-01-31"), "monthly", 1);
    expect(contractEnd?.toISOString()).toBe("2024-02-29T02:59:59.999Z");
    const start = renewalStartsAt(contractEnd!);
    expect(periodDueAt(start, "monthly", 0).toISOString()).toBe("2024-02-29T15:00:00.000Z");
    expect(endOfPreviousCivilDay(periodDueAt(start, "monthly", 0)).toISOString()).toBe(
      contractEnd?.toISOString(),
    );
  });
});

describe("faturas da renovação", () => {
  const start = new Date("2026-12-25T03:00:00.000Z");
  const end = new Date("2027-03-25T02:59:59.999Z");

  it("mensal gera os ciclos devidos e para no fim da vigência", () => {
    const { periods } = renewalChargePeriods(
      {
        subscriptionId: "sub",
        startsAt: start,
        endsAt: end,
        billingInterval: "monthly",
        priceCents: 13400,
      },
      noon("2027-03-20"),
      7,
    );
    expect(periods.map((period) => period.dueAt.toISOString())).toEqual([
      "2026-12-25T15:00:00.000Z",
      "2027-01-25T15:00:00.000Z",
      "2027-02-25T15:00:00.000Z",
    ]);
  });

  it("à vista gera uma única fatura mesmo com o gerador atrasado", () => {
    const { periods } = renewalChargePeriods(
      {
        subscriptionId: "sub",
        startsAt: start,
        endsAt: new Date("2028-01-01T02:59:59.999Z"),
        billingInterval: "quarterly",
        priceCents: 55000,
      },
      noon("2027-06-01"),
      7,
    );
    expect(periods).toHaveLength(1);
    expect(periods[0]?.dueAt.toISOString()).toBe("2026-12-25T15:00:00.000Z");
  });

  it("não antecipa cobrança fora do horizonte", () => {
    const { periods } = renewalChargePeriods(
      {
        subscriptionId: "sub",
        startsAt: start,
        endsAt: end,
        billingInterval: "monthly",
        priceCents: 13400,
      },
      noon("2026-09-25"),
      7,
    );
    expect(periods).toHaveLength(0);
  });

  it("não inventa preço nem intervalo", () => {
    expect(
      renewalChargePeriods(
        {
          subscriptionId: "sub",
          startsAt: start,
          endsAt: end,
          billingInterval: "monthly",
          priceCents: null,
        },
        noon("2026-12-25"),
      ).review,
    ).toMatch(/preço/);
    expect(
      renewalChargePeriods(
        {
          subscriptionId: "sub",
          startsAt: start,
          endsAt: end,
          billingInterval: "semanal",
          priceCents: 100,
        },
        noon("2026-12-25"),
      ).review,
    ).toMatch(/intervalo/);
  });
});

describe("acesso da renovação", () => {
  it("não libera renovação futura nem trata cobrança ausente como adimplência", () => {
    expect(
      decideCoverage({
        hasBadInvoice: false,
        originalActive: true,
        renewalCoversNow: false,
        renewalChargeMissing: false,
      }).allowed,
    ).toBe(true);
    expect(
      decideCoverage({
        hasBadInvoice: false,
        originalActive: false,
        renewalCoversNow: true,
        renewalChargeMissing: true,
      }),
    ).toMatchObject({ allowed: false, internalReason: "faturamento_pendente", status: "inactive" });
    expect(
      decideCoverage({
        hasBadInvoice: true,
        originalActive: false,
        renewalCoversNow: true,
        renewalChargeMissing: false,
      }).status,
    ).toBe("delinquent");
  });
});
