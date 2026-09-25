import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { billingReviews, invoices, studentSubscriptions, students, subscriptionTerms } from "@/lib/db/schema";
import { withBypassRlsTransaction } from "@/lib/db/with-tenant";
import { generateSubscriptionInvoicesForTenant } from "@/lib/services/billing/subscription-invoice";
import { createTenantWithAdmin } from "@/lib/services/onboarding/create-tenant";

describe("preço histórico da migration", () => {
  it("não cobra ciclos anteriores a valid_from e não duplica a revisão", async () => {
    const suffix = randomUUID().slice(0, 8);
    const created = await createTenantWithAdmin({
      name: `Hist ${suffix}`,
      slug: `hist-${suffix}`,
      adminEmail: `hist-${suffix}@example.com`,
      adminPassword: "senha-segura-12",
    });
    const tenantId = created.tenant.id;
    const tomorrow = new Date(Date.now() + 48 * 60 * 60 * 1000);
    await withBypassRlsTransaction(async (tx) => {
      const [plan] = await tx.insert((await import("@/lib/db/schema")).plans).values({
        tenantId,
        name: "Mensal",
        priceCents: 15000,
        billingInterval: "monthly",
      }).returning();
      const [student] = await tx.insert(students).values({
        tenantId,
        fullName: "Antigo",
        cpf: `h${suffix}`,
      }).returning();
      const [sub] = await tx.insert(studentSubscriptions).values({
        tenantId,
        studentId: student!.id,
        planId: plan!.id,
        priceCents: 15000,
        billingInterval: "monthly",
        startsAt: new Date("2026-01-15T15:00:00.000Z"),
        endsAt: new Date("2026-12-15T15:00:00.000Z"),
        active: true,
      }).returning();
      await tx.insert(subscriptionTerms).values({
        tenantId,
        subscriptionId: sub!.id,
        planId: plan!.id,
        priceCents: 15000,
        billingInterval: "monthly",
        startsAt: new Date("2026-01-15T15:00:00.000Z"),
        endsAt: new Date("2026-12-15T15:00:00.000Z"),
        validFrom: tomorrow,
        source: "migration",
        note: "Preço atual copiado. Não vale para ciclos anteriores.",
      });
    });

    const first = await generateSubscriptionInvoicesForTenant(tenantId);
    const second = await generateSubscriptionInvoicesForTenant(tenantId);
    expect(first.created).toBe(0);
    expect(second.created).toBe(0);

    const reviews = await withBypassRlsTransaction(async (tx) => {
      return tx.select({ key: billingReviews.periodKey }).from(billingReviews).where(eq(billingReviews.tenantId, tenantId));
    });
    const invoicesRows = await withBypassRlsTransaction(async (tx) => {
      return tx.select({ id: invoices.id }).from(invoices).where(eq(invoices.tenantId, tenantId));
    });
    expect(invoicesRows).toHaveLength(0);
    expect(reviews.length).toBeGreaterThan(0);
    expect(new Set(reviews.map((row) => row.key)).size).toBe(reviews.length);
  });
});
