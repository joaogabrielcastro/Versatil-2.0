import { describe, expect, it } from "vitest";
import {
  VERSATIL_ACTIVITIES,
  VERSATIL_PLANS,
} from "@/lib/catalog/versatil-table";

describe("tabela Versátil", () => {
  it("não repete código de plano nem de aula", () => {
    const planCodes = VERSATIL_PLANS.map((plan) => plan.code);
    const activityCodes = VERSATIL_ACTIVITIES.map((activity) => activity.code);
    expect(new Set(planCodes).size).toBe(planCodes.length);
    expect(new Set(activityCodes).size).toBe(activityCodes.length);
  });

  it("guarda os preços do cartaz", () => {
    const price = (code: string) =>
      VERSATIL_PLANS.find((plan) => plan.code === code)?.priceCents;
    expect(price("academia-mensal-vista")).toBe(14400);
    expect(price("academia-mensal-recorrente")).toBe(12400);
    expect(price("academia-trimestral")).toBe(13400);
    expect(price("lutas-mensal")).toBe(11400);
    expect(price("familia-dupla")).toBe(12900);
    expect(price("familia-trio")).toBe(12800);
    expect(price("familia-4")).toBe(12400);
    expect(price("crossfit-3x-mensal")).toBe(21000);
    expect(price("crossfit-livre-mensal")).toBe(23000);
    expect(price("crossfit-livre-trimestral-vista")).toBe(55000);
    expect(price("crossfit-livre-semestral-vista")).toBe(99000);
    expect(price("crossfit-livre-anual-vista")).toBe(180000);
    expect(price("taxa-matricula-academia")).toBe(3000);
    expect(price("taxa-nutricionista")).toBe(20000);
    expect(price("taxa-avaliacao-fisica")).toBe(3000);
    expect(price("taxa-matricula-crossfit")).toBe(5000);
    expect(price("taxa-aula-avulsa-crossfit")).toBe(4000);
  });

  it("não oferece CrossFit 3x à vista", () => {
    const upfront3x = VERSATIL_PLANS.filter(
      (plan) =>
        plan.category === "CrossFit 3x" && plan.billingInterval !== "monthly",
    );
    expect(upfront3x).toEqual([]);
  });

  it("monta a grade do cartaz", () => {
    const spinning = VERSATIL_ACTIVITIES.find((item) => item.code === "spinning");
    expect(spinning?.slots).toEqual(
      expect.arrayContaining([
        { weekday: 2, startTime: "07:00" },
        { weekday: 4, startTime: "18:30" },
        { weekday: 5, startTime: "19:00" },
      ]),
    );
    const jiu = VERSATIL_ACTIVITIES.find((item) => item.code === "jiu-jitsu");
    expect(jiu?.slots).toHaveLength(5);
  });
});
