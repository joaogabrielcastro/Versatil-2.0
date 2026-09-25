import { describe, expect, it } from "vitest";
import { isInvoiceOverdue } from "@/lib/billing/due-day";

describe("isInvoiceOverdue", () => {
  const dueToday = new Date("2026-09-25T15:00:00.000Z");

  it("não atrasa a fatura no próprio dia civil, mesmo depois do horário gravado", () => {
    expect(isInvoiceOverdue(dueToday, new Date("2026-09-25T18:00:00.000Z"))).toBe(
      false,
    );
    expect(isInvoiceOverdue(dueToday, new Date("2026-09-26T01:30:00.000Z"))).toBe(
      false,
    );
  });

  it("atrasa na virada para o dia seguinte em São Paulo", () => {
    expect(isInvoiceOverdue(dueToday, new Date("2026-09-26T03:00:00.000Z"))).toBe(
      true,
    );
  });

  it("trata vencimento de ontem como atrasado e o de amanhã como em aberto", () => {
    const now = new Date("2026-09-25T18:00:00.000Z");
    expect(isInvoiceOverdue(new Date("2026-09-24T15:00:00.000Z"), now)).toBe(true);
    expect(isInvoiceOverdue(new Date("2026-09-26T15:00:00.000Z"), now)).toBe(false);
  });
});
