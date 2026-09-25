import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { invoices, students } from "@/lib/db/schema";
import { withBypassRlsTransaction, withTenantTransaction } from "@/lib/db/with-tenant";
import { PaymentProviderError } from "@/lib/payments/types";
import { chargeInvoiceOnStone } from "@/lib/services/billing/stone-charge";
import { reconcilePendingStoneCharges } from "@/lib/services/billing/stone-reconcile";
import { createTenantWithAdmin } from "@/lib/services/onboarding/create-tenant";

async function openInvoice(suffix: string) {
  const created = await createTenantWithAdmin({
    name: `Stone ${suffix}`,
    slug: `stone-${suffix}`,
    adminEmail: `stone-${suffix}@example.com`,
    adminPassword: "senha-segura-12",
  });
  const tenantId = created.tenant.id;
  const invoiceId = await withBypassRlsTransaction(async (tx) => {
    const [student] = await tx
      .insert(students)
      .values({ tenantId, fullName: "Aluno Stone", cpf: "11144477735" })
      .returning({ id: students.id });
    const [inv] = await tx
      .insert(invoices)
      .values({
        tenantId,
        studentId: student!.id,
        amountCents: 9900,
        currency: "BRL",
        status: "open",
        dueAt: new Date("2026-10-01T00:00:00.000Z"),
      })
      .returning({ id: invoices.id });
    return inv!.id;
  });
  return { tenantId, invoiceId };
}

describe("cobrança Stone fora da transação", () => {
  it("não reenvia a cobrança quando a resposta da Stone se perde", async () => {
    const suffix = randomUUID().slice(0, 8);
    const { tenantId, invoiceId } = await openInvoice(suffix);
    let calls = 0;

    const sender = async () => {
      calls += 1;
      throw new PaymentProviderError(
        "stone_connect",
        "timeout depois de aceitar",
        undefined,
        "unknown",
      );
    };

    const first = await chargeInvoiceOnStone({ tenantId, invoiceId }, sender);
    expect(first.ok).toBe(false);
    expect(calls).toBe(1);

    const second = await chargeInvoiceOnStone({ tenantId, invoiceId }, sender);
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.http).toBe(409);
    expect(calls).toBe(1);

    const mid = await withTenantTransaction(tenantId, async (tx) => {
      const [row] = await tx
        .select({
          externalId: invoices.externalId,
          gatewayChargeStatus: invoices.gatewayChargeStatus,
        })
        .from(invoices)
        .where(eq(invoices.id, invoiceId))
        .limit(1);
      return row;
    });
    expect(mid?.externalId).toBeNull();
    expect(mid?.gatewayChargeStatus).toBe("pending");
  });

  it("não quita conciliação paga sem valor e moeda", async () => {
    const suffix = randomUUID().slice(0, 8);
    const { tenantId, invoiceId } = await openInvoice(`r-${suffix}`);
    await withTenantTransaction(tenantId, async (tx) => {
      await tx
        .update(invoices)
        .set({ gatewayChargeStatus: "pending", externalId: "ch_pending" })
        .where(eq(invoices.id, invoiceId));
    });

    const incomplete = await reconcilePendingStoneCharges(async (_tenantId, externalId) => {
      if (externalId !== "ch_pending") {
        return { externalId, status: "pending" as const };
      }
      return { externalId, status: "paid" as const };
    });
    expect(incomplete.paid).toBe(0);

    const matched = await reconcilePendingStoneCharges(async (_tenantId, externalId) => {
      if (externalId !== "ch_pending") {
        return { externalId, status: "pending" as const };
      }
      return {
        externalId,
        status: "paid" as const,
        amountCents: 9900,
        currency: "BRL",
      };
    });
    expect(matched.paid).toBe(1);

    const row = await withTenantTransaction(tenantId, async (tx) => {
      const [inv] = await tx
        .select({ status: invoices.status })
        .from(invoices)
        .where(eq(invoices.id, invoiceId))
        .limit(1);
      return inv;
    });
    expect(row?.status).toBe("paid");
  });
});
