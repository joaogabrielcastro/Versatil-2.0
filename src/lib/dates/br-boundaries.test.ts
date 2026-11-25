import { describe, expect, it } from "vitest";
import { startOfDayBr, startOfMonthBr } from "@/lib/dates/br";

describe("limites de dia e mês em São Paulo", () => {
  it("22h de Brasília ainda é o mesmo dia, mesmo já sendo o dia seguinte em UTC", () => {
    const now = new Date("2026-11-26T01:00:00.000Z"); // 25/11 22:00 BRT
    expect(startOfDayBr(now).toISOString()).toBe("2026-11-25T03:00:00.000Z");
  });

  it("virada do mês usa o calendário de Brasília", () => {
    const lastNightOfNov = new Date("2026-12-01T02:30:00.000Z"); // 30/11 23:30 BRT
    expect(startOfMonthBr(lastNightOfNov).toISOString()).toBe("2026-11-01T03:00:00.000Z");
    const firstOfDec = new Date("2026-12-01T03:00:00.000Z"); // 01/12 00:00 BRT
    expect(startOfMonthBr(firstOfDec).toISOString()).toBe("2026-12-01T03:00:00.000Z");
  });
});
