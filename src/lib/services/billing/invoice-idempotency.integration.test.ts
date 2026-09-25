import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { invoices, students } from "@/lib/db/schema";
import { withBypassRlsTransaction, withTenantTransaction } from "@/lib/db/with-tenant";
import { createInvoiceIfAbsent } from "@/lib/services/billing/subscription-invoice";
import { createTenantWithAdmin } from "@/lib/services/onboarding/create-tenant";

describe("geração concorrente de fatura", () => {
  it("duas transações com a mesma chave criam uma fatura", async () => {
    const suffix = randomUUID().slice(0, 8);
    const created = await createTenantWithAdmin({
      name: `Fatura ${suffix}`,
      slug: `fat-${suffix}`,
      adminEmail: `fat-${suffix}@example.com`,
      adminPassword: "senha-segura-12",
    });
    const tenantId = created.tenant.id;
    const studentId = await withBypassRlsTransaction(async (tx) => {
      const [student] = await tx
        .insert(students)
        .values({ tenantId, fullName: "Aluno fatura", cpf: "11144477735" })
        .returning({ id: students.id });
      return student!.id;
    });
    const key = `period-${suffix}`;
    const due = new Date("2026-10-01T00:00:00.000Z");
    const [a, b] = await Promise.all([
      withTenantTransaction(tenantId, (tx) =>
        createInvoiceIfAbsent(tx, {
          tenantId,
          studentId,
          amountCents: 9900,
          dueAt: due,
          idempotencyKey: key,
        }),
      ),
      withTenantTransaction(tenantId, (tx) =>
        createInvoiceIfAbsent(tx, {
          tenantId,
          studentId,
          amountCents: 9900,
          dueAt: due,
          idempotencyKey: key,
        }),
      ),
    ]);
    expect([a.created, b.created].filter(Boolean)).toHaveLength(1);
    const rows = await withTenantTransaction(tenantId, async (tx) => {
      return tx.select({ id: invoices.id }).from(invoices).where(eq(invoices.tenantId, tenantId));
    });
    expect(rows).toHaveLength(1);
  });
});
