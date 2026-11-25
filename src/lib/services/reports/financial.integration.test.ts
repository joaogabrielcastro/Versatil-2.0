import { randomUUID } from "crypto";
import { describe, expect, it, vi } from "vitest";
import { invoices, students } from "@/lib/db/schema";
import { withBypassRlsTransaction } from "@/lib/db/with-tenant";
import { createTenantWithAdmin } from "@/lib/services/onboarding/create-tenant";

vi.mock("server-only", () => ({}));

describe("relatório financeiro", () => {
  it("mostra faturado e recebido do período separados; soma em aberto no banco", async () => {
    const { buildFinancialReport } = await import("@/lib/services/reports/financial");
    const { parseReportDateRange } = await import("@/lib/reports/date-range");
    const suffix = randomUUID().slice(0, 8);
    const created = await createTenantWithAdmin({
      name: `Rel ${suffix}`,
      slug: `rel-${suffix}`,
      adminEmail: `rel-${suffix}@example.com`,
      adminPassword: "senha-segura-12",
    });
    const tenantId = created.tenant.id;
    await withBypassRlsTransaction(async (tx) => {
      const [s] = await tx
        .insert(students)
        .values({ tenantId, fullName: "Aluno", cpf: `r${suffix}` })
        .returning();
      await tx.insert(invoices).values([
        // Vence em março e é paga em março.
        { tenantId, studentId: s!.id, amountCents: 10000, dueAt: new Date("2026-03-10T15:00:00.000Z"), status: "paid", paidAt: new Date("2026-03-10T16:00:00.000Z"), settlementSource: "manual_reception" },
        // Vence em março, ainda aberta.
        { tenantId, studentId: s!.id, amountCents: 20000, dueAt: new Date("2026-03-20T15:00:00.000Z"), status: "open" },
        // Cancelada em março: fora do faturado.
        { tenantId, studentId: s!.id, amountCents: 99900, dueAt: new Date("2026-03-15T15:00:00.000Z"), status: "void" },
        // Venceu em fevereiro, paga em março: recebido de março, faturado de fevereiro.
        { tenantId, studentId: s!.id, amountCents: 5000, dueAt: new Date("2026-02-10T15:00:00.000Z"), status: "paid", paidAt: new Date("2026-03-02T15:00:00.000Z"), settlementSource: "manual_reception" },
        // Aberta em abril (fora do período, mas entra no "em aberto hoje").
        { tenantId, studentId: s!.id, amountCents: 7000, dueAt: new Date("2026-04-10T15:00:00.000Z"), status: "open" },
      ]);
    });
    const range = parseReportDateRange("2026-03-01", "2026-03-31");
    if ("error" in range) throw new Error(range.error);
    const report = await buildFinancialReport(tenantId, range);
    expect(report.summary.billedCents).toBe(30000);
    expect(report.summary.billedCount).toBe(2);
    expect(report.summary.receivedCents).toBe(15000);
    expect(report.summary.paidCount).toBe(2);
    expect(report.summary.openCents).toBe(27000);
    expect(report.summary.openCount).toBe(2);
  });
});
