import { describe, expect, it } from "vitest";
import { parseApiDate } from "@/lib/dates/api-date";
import { toIsoDateInTz } from "@/lib/dates/br";

describe("parseApiDate", () => {
  it("data sem hora continua no mesmo dia em São Paulo", () => {
    const d = parseApiDate("2026-11-25");
    expect(toIsoDateInTz(d)).toBe("2026-11-25");
    expect(d.toISOString()).toBe("2026-11-25T15:00:00.000Z");
  });

  it("ISO completo é respeitado", () => {
    expect(parseApiDate("2026-11-25T02:00:00.000Z").toISOString()).toBe("2026-11-25T02:00:00.000Z");
  });

  it("valor inválido continua inválido para o chamador recusar", () => {
    expect(Number.isNaN(parseApiDate("31/02/2026").getTime())).toBe(true);
  });
});
