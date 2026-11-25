import { randomUUID } from "crypto";
import { describe, expect, it } from "vitest";
import {
  accessEvents,
  invoices,
  plans,
  studentSubscriptions,
  students,
} from "@/lib/db/schema";
import { withBypassRlsTransaction, withTenantTransaction } from "@/lib/db/with-tenant";
import { buildDashboardMetrics } from "@/lib/services/dashboard/metrics";
import { createTenantWithAdmin } from "@/lib/services/onboarding/create-tenant";

// "Agora" = 25/11/2026 22:00 em São Paulo (já 26/11 em UTC).
const NOW = new Date("2026-11-26T01:00:00.000Z");

describe("indicadores do painel", () => {
  it("separa faturado de recebido, conta alunos distintos e respeita o fuso", async () => {
    const suffix = randomUUID().slice(0, 8);
    const created = await createTenantWithAdmin({
      name: `Painel ${suffix}`,
      slug: `painel-${suffix}`,
      adminEmail: `painel-${suffix}@example.com`,
      adminPassword: "senha-segura-12",
    });
    const tenantId = created.tenant.id;

    await withBypassRlsTransaction(async (tx) => {
      const [plan] = await tx
        .insert(plans)
        .values({ tenantId, name: "Mensal", priceCents: 10000 })
        .returning();
      const [a, b, c] = await tx
        .insert(students)
        .values([
          { tenantId, fullName: "A", cpf: `a${suffix}` },
          { tenantId, fullName: "B", cpf: `b${suffix}` },
          { tenantId, fullName: "C", cpf: `c${suffix}` },
        ])
        .returning();
      const sub = (studentId: string, createdAt: Date, cancelRequestedAt: Date | null = null) => ({
        tenantId,
        studentId,
        planId: plan!.id,
        startsAt: new Date("2026-09-01T15:00:00.000Z"),
        active: true,
        priceCents: 10000,
        billingInterval: "monthly",
        createdAt,
        cancelRequestedAt,
      });
      await tx.insert(studentSubscriptions).values([
        sub(a!.id, new Date("2026-11-03T15:00:00.000Z")),
        sub(b!.id, new Date("2026-11-04T15:00:00.000Z"), new Date("2026-11-20T15:00:00.000Z")),
        sub(c!.id, new Date("2026-10-10T15:00:00.000Z")),
      ]);
      await tx.insert(invoices).values([
        // Novembro: faturado 300, recebido 100 (A pagou), B vencida, C a vencer.
        {
          tenantId,
          studentId: a!.id,
          amountCents: 10000,
          dueAt: new Date("2026-11-05T15:00:00.000Z"),
          status: "paid",
          paidAt: new Date("2026-11-05T16:00:00.000Z"),
          settlementSource: "manual_reception",
        },
        { tenantId, studentId: b!.id, amountCents: 10000, dueAt: new Date("2026-11-10T15:00:00.000Z"), status: "open" },
        { tenantId, studentId: c!.id, amountCents: 10000, dueAt: new Date("2026-11-28T15:00:00.000Z"), status: "open" },
        // Cancelada: não entra no faturado.
        { tenantId, studentId: c!.id, amountCents: 99900, dueAt: new Date("2026-11-12T15:00:00.000Z"), status: "void" },
        // Pagamento de outubro feito em 25/11 às 23h (BRT): recebido em novembro.
        {
          tenantId,
          studentId: c!.id,
          amountCents: 5000,
          dueAt: new Date("2026-10-15T15:00:00.000Z"),
          status: "paid",
          paidAt: new Date("2026-11-26T02:00:00.000Z"),
          settlementSource: "manual_reception",
        },
      ]);
      await tx.insert(accessEvents).values([
        // A passa 3 vezes hoje (BRT) = 1 entrada.
        { tenantId, studentId: a!.id, allowed: true, createdAt: new Date("2026-11-25T12:00:00.000Z") },
        { tenantId, studentId: a!.id, allowed: true, createdAt: new Date("2026-11-25T18:00:00.000Z") },
        { tenantId, studentId: a!.id, allowed: true, createdAt: new Date("2026-11-26T00:30:00.000Z") },
        // B barrada hoje.
        { tenantId, studentId: b!.id, allowed: false, reason: "inadimplente", createdAt: new Date("2026-11-25T13:00:00.000Z") },
        // Ontem (BRT), mesmo sendo 25/11 em UTC às 02:00: não conta hoje.
        { tenantId, studentId: c!.id, allowed: true, createdAt: new Date("2026-11-25T02:00:00.000Z") },
      ]);
    });

    const m = await withTenantTransaction(tenantId, (tx) =>
      buildDashboardMetrics(tx, tenantId, NOW),
    );

    expect(m.today).toEqual({ entries: 1, blocked: 1 });
    expect(m.month.billedCents).toBe(30000);
    expect(m.month.receivedCents).toBe(15000);
    expect(m.month.newSubscriptions).toBe(2);
    expect(m.month.cancellations).toBe(1);
    expect(m.overdue).toEqual({ cents: 10000, invoices: 1, students: 1 });
    expect(m.students.total).toBe(3);
    expect(m.history.map((p) => p.month)).toEqual([
      "2026-06",
      "2026-07",
      "2026-08",
      "2026-09",
      "2026-10",
      "2026-11",
    ]);
    expect(m.history[4]).toMatchObject({ month: "2026-10", newSubscriptions: 1, billedCents: 5000, receivedCents: 0 });
  });
});
