import { randomUUID } from "crypto";
import { eq, like } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  billingReviews,
  invoices,
  plans,
  studentSubscriptions,
  students,
  subscriptionTerms,
} from "@/lib/db/schema";
import { withBypassRlsTransaction } from "@/lib/db/with-tenant";
import {
  MAX_NEW_INVOICES_PER_SUBSCRIPTION_RUN,
  generateSubscriptionInvoicesForTenant,
} from "@/lib/services/billing/subscription-invoice";
import { createTenantWithAdmin } from "@/lib/services/onboarding/create-tenant";

async function tenantWithSubscriptions(count: number, startsAt: Date) {
  const suffix = randomUUID().slice(0, 8);
  const created = await createTenantWithAdmin({
    name: `Escala ${suffix}`,
    slug: `escala-${suffix}`,
    adminEmail: `escala-${suffix}@example.com`,
    adminPassword: "senha-segura-12",
  });
  const tenantId = created.tenant.id;
  await withBypassRlsTransaction(async (tx) => {
    const [plan] = await tx
      .insert(plans)
      .values({ tenantId, name: "Mensal", priceCents: 12900, billingInterval: "monthly" })
      .returning();
    const studentRows = await tx
      .insert(students)
      .values(
        Array.from({ length: count }, (_, i) => ({
          tenantId,
          fullName: `Aluno ${i}`,
          cpf: `${suffix}${String(i).padStart(3, "0")}`,
        })),
      )
      .returning({ id: students.id });
    const subs = await tx
      .insert(studentSubscriptions)
      .values(
        studentRows.map((s) => ({
          tenantId,
          studentId: s.id,
          planId: plan!.id,
          priceCents: 12900,
          billingInterval: "monthly",
          startsAt,
          active: true,
        })),
      )
      .returning({ id: studentSubscriptions.id });
    await tx.insert(subscriptionTerms).values(
      subs.map((sub) => ({
        tenantId,
        subscriptionId: sub.id,
        planId: plan!.id,
        priceCents: 12900,
        billingInterval: "monthly",
        startsAt,
        validFrom: startsAt,
        source: "contract",
      })),
    );
  });
  return tenantId;
}

async function invoiceCount(tenantId: string) {
  const rows = await withBypassRlsTransaction((tx) =>
    tx.select({ id: invoices.id }).from(invoices).where(eq(invoices.tenantId, tenantId)),
  );
  return rows.length;
}

describe("geração de faturas em escala", () => {
  it("academia com 250 vencimentos no mesmo dia recebe todos numa execução", async () => {
    const now = new Date("2026-11-25T12:00:00.000Z");
    const tenantId = await tenantWithSubscriptions(250, new Date("2026-11-24T15:00:00.000Z"));
    const result = await generateSubscriptionInvoicesForTenant(tenantId, now);
    expect(result.created).toBe(250);
    expect(await invoiceCount(tenantId)).toBe(250);
    // Idempotente: rodar de novo não duplica.
    expect((await generateSubscriptionInvoicesForTenant(tenantId, now)).created).toBe(0);
  });

  it("assinatura com muitos ciclos atrasados gera só o limite e vai para revisão", async () => {
    const now = new Date("2026-11-25T12:00:00.000Z");
    const tenantId = await tenantWithSubscriptions(1, new Date("2023-03-10T15:00:00.000Z"));
    const result = await generateSubscriptionInvoicesForTenant(tenantId, now);
    expect(result.created).toBe(MAX_NEW_INVOICES_PER_SUBSCRIPTION_RUN);
    const reviews = await withBypassRlsTransaction((tx) =>
      tx
        .select({ key: billingReviews.periodKey })
        .from(billingReviews)
        .where(like(billingReviews.periodKey, "%:cap")),
    );
    expect(reviews.some((r) => r.key.includes(":cap"))).toBe(true);
    // As próximas execuções continuam de onde parou, sem duplicar.
    // Mar/2023 a Nov/2026 (+7 dias de antecedência) = 45 ciclos mensais.
    const second = await generateSubscriptionInvoicesForTenant(tenantId, now);
    expect(second.created).toBe(45 - MAX_NEW_INVOICES_PER_SUBSCRIPTION_RUN);
    expect((await generateSubscriptionInvoicesForTenant(tenantId, now)).created).toBe(0);
    expect(await invoiceCount(tenantId)).toBe(45);
  });
});
