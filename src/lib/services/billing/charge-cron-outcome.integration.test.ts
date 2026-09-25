import { randomUUID } from "crypto";
import { desc, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { finishCron } from "@/lib/cron/http";
import { cronRuns, invoices, plans, studentSubscriptions, students } from "@/lib/db/schema";
import { withBypassRlsTransaction } from "@/lib/db/with-tenant";
import type { StoneChargeSender } from "@/lib/services/billing/stone-charge";
import { chargeDueInvoicesAll } from "@/lib/services/billing/recurring-charge";
import { createTenantWithAdmin } from "@/lib/services/onboarding/create-tenant";
import { PaymentProviderError } from "@/lib/payments/types";

const now = new Date("2026-09-25T15:00:00.000Z");

async function tenantWithInvoices(label: string, count: number) {
  const suffix = randomUUID().slice(0, 8);
  const created = await createTenantWithAdmin({
    name: label,
    slug: `${label}-${suffix}`,
    adminEmail: `${label}-${suffix}@example.com`,
    adminPassword: "senha-segura-12",
  });
  const ids: string[] = [];
  await withBypassRlsTransaction(async (tx) => {
    const [plan] = await tx.insert(plans).values({
      tenantId: created.tenant.id, name: "Mensal", priceCents: 5000, billingInterval: "monthly",
    }).returning();
    const [student] = await tx.insert(students).values({
      tenantId: created.tenant.id, fullName: label, cpf: `${label}${suffix}`.slice(0, 11),
    }).returning();
    await tx.insert(studentSubscriptions).values({
      tenantId: created.tenant.id,
      studentId: student!.id,
      planId: plan!.id,
      priceCents: 5000,
      billingInterval: "monthly",
      startsAt: new Date("2026-01-15T15:00:00.000Z"),
      endsAt: new Date("2026-12-15T15:00:00.000Z"),
      active: true,
      autoChargePos: true,
    });
    for (let i = 0; i < count; i++) {
      const [invoice] = await tx.insert(invoices).values({
        tenantId: created.tenant.id,
        studentId: student!.id,
        amountCents: 5000,
        currency: "BRL",
        status: "open",
        dueAt: new Date("2026-09-15T15:00:00.000Z"),
        idempotencyKey: `charge:${label}:${suffix}:${i}`,
      }).returning({ id: invoices.id });
      ids.push(invoice!.id);
    }
  });
  return { tenantId: created.tenant.id, invoiceIds: ids };
}

function simulated(failIds: Set<string>, calls: { n: number }): StoneChargeSender {
  return async (input) => {
    calls.n++;
    if (failIds.has(input.invoiceId)) {
      throw new PaymentProviderError("stone_connect", "simulado recusou", undefined, "rejected");
    }
    return { externalId: `sim_${input.invoiceId.slice(0, 8)}`, status: "sent_to_terminal" };
  };
}

async function recordedOutcome() {
  const [row] = await withBypassRlsTransaction(async (tx) => {
    return tx
      .select({ ok: cronRuns.ok, error: cronRuns.error, summary: cronRuns.summary })
      .from(cronRuns)
      .where(eq(cronRuns.job, "charge-open-invoices"))
      .orderBy(desc(cronRuns.finishedAt))
      .limit(1);
  });
  return row;
}

describe("cron de cobrança com provedor simulado", () => {
  it("falha total, parcial e sucesso ficam distinguíveis e a repetição não cobra de novo", async () => {
    const failed = await tenantWithInvoices("falha", 2);
    const failCalls = { n: 0 };
    const allFailed = await chargeDueInvoicesAll(
      now,
      simulated(new Set(failed.invoiceIds), failCalls),
      [failed.tenantId],
    );
    const failedRes = await finishCron("charge-open-invoices", allFailed);
    expect(failedRes.status).toBe(500);
    expect(allFailed.chargeOutcome).toBe("failed");
    expect(allFailed.succeeded).toBe(0);
    expect(allFailed.failed).toBe(2);
    let saved = await recordedOutcome();
    expect(saved?.ok).toBe(false);
    expect(saved?.error).toMatch(/failed/);

    const bad = await tenantWithInvoices("parcial-ruim", 1);
    const good = await tenantWithInvoices("parcial-bom", 1);
    const partialCalls = { n: 0 };
    const partial = await chargeDueInvoicesAll(
      now,
      simulated(new Set(bad.invoiceIds), partialCalls),
      [bad.tenantId, good.tenantId],
    );
    const partialRes = await finishCron("charge-open-invoices", partial);
    expect(partial.chargeOutcome).toBe("partial");
    expect(partial.succeeded).toBeGreaterThan(0);
    expect(partial.failed).toBeGreaterThan(0);
    expect(partial.failedTenantIds).not.toContain(good.tenantId);
    expect(partialRes.status).toBe(500);
    saved = await recordedOutcome();
    expect(saved?.ok).toBe(false);
    expect(saved?.error).toMatch(/partial/);

    const okTenant = await tenantWithInvoices("ok", 1);
    const okCalls = { n: 0 };
    const success = await chargeDueInvoicesAll(
      now,
      simulated(new Set(), okCalls),
      [okTenant.tenantId],
    );
    const successRes = await finishCron("charge-open-invoices", success);
    expect(success.chargeOutcome).toBe("success");
    expect(success.failed).toBe(0);
    expect(success.succeeded).toBeGreaterThan(0);
    expect(successRes.status).toBe(200);
    saved = await recordedOutcome();
    expect(saved?.ok).toBe(true);
    expect(JSON.stringify(saved?.summary)).toMatch(/completed/);

    const againCalls = { n: 0 };
    const again = await chargeDueInvoicesAll(
      now,
      simulated(new Set(), againCalls),
      [okTenant.tenantId],
    );
    const resent = againCalls.n;
    expect(resent).toBe(0);
    expect(again.skipped).toBeGreaterThan(0);
    expect(okTenant.invoiceIds.length).toBe(1);
  });
});
