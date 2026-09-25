import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { invoices, paymentConflicts, plans, studentSubscriptions, students } from "@/lib/db/schema";
import { withBypassRlsTransaction } from "@/lib/db/with-tenant";
import { cancelSubscription } from "@/lib/services/billing/subscription-actions";
import { reserveStoneChargeSlot } from "@/lib/services/billing/stone-charge";
import { createTenantWithAdmin } from "@/lib/services/onboarding/create-tenant";
import { processWebhookJob } from "@/workers/processors/webhook-job";

const now = new Date("2026-03-20T15:00:00.000Z");

async function academy(label: string) {
  const suffix = randomUUID().slice(0, 8);
  const created = await createTenantWithAdmin({
    name: `${label} ${suffix}`,
    slug: `${label}-${suffix}`,
    adminEmail: `${label}-${suffix}@example.com`,
    adminPassword: "senha-segura-12",
  });
  const tenantId = created.tenant.id;
  const row = await withBypassRlsTransaction(async (tx) => {
    const [plan] = await tx.insert(plans).values({
      tenantId, name: "Mensal", priceCents: 9000, billingInterval: "monthly",
    }).returning();
    const [student] = await tx.insert(students).values({
      tenantId, fullName: `Aluno ${label}`, cpf: `${label}${suffix}`.slice(0, 11),
    }).returning();
    const [sub] = await tx.insert(studentSubscriptions).values({
      tenantId,
      studentId: student!.id,
      planId: plan!.id,
      priceCents: 9000,
      billingInterval: "monthly",
      startsAt: new Date("2026-01-15T15:00:00.000Z"),
      endsAt: new Date("2026-12-15T15:00:00.000Z"),
      active: true,
    }).returning();
    return { studentId: student!.id, subscriptionId: sub!.id };
  });
  return { tenantId, actor: created.admin.id, ...row };
}

async function addInvoice(
  tenantId: string,
  studentId: string,
  subscriptionId: string,
  due: string,
  gateway: "idle" | "pending",
  extra?: { externalId?: string; attemptKey?: string },
) {
  const [row] = await withBypassRlsTransaction(async (tx) => {
    return tx.insert(invoices).values({
      tenantId,
      studentId,
      amountCents: 9000,
      currency: "BRL",
      status: "open",
      dueAt: new Date(`${due}T15:00:00.000Z`),
      idempotencyKey: `sub:${subscriptionId}:${due}`,
      gatewayChargeStatus: gateway,
      externalId: extra?.externalId,
      gatewayIdempotencyKey: extra?.attemptKey,
    }).returning({ id: invoices.id, externalId: invoices.externalId });
  });
  return row!;
}

async function snapshot(invoiceId: string, subscriptionId: string) {
  return withBypassRlsTransaction(async (tx) => {
    const [invoice] = await tx.select({
      status: invoices.status,
      gateway: invoices.gatewayChargeStatus,
      externalId: invoices.externalId,
      attemptKey: invoices.gatewayIdempotencyKey,
    }).from(invoices).where(eq(invoices.id, invoiceId));
    const [sub] = await tx.select({
      active: studentSubscriptions.active,
    }).from(studentSubscriptions).where(eq(studentSubscriptions.id, subscriptionId));
    return { invoice, sub };
  });
}

describe("POS pendente bloqueia o cancelamento", () => {
  it("período anterior, vigente e futuro não anulam nem apagam a cobrança", async () => {
    const cases = [
      { due: "2026-01-15", charge: "ch_past" },
      { due: "2026-03-15", charge: "ch_now" },
      { due: "2026-04-15", charge: "ch_next" },
    ];
    for (const item of cases) {
      const fx = await academy(item.charge);
      const pending = await addInvoice(fx.tenantId, fx.studentId, fx.subscriptionId, item.due, "pending", { externalId: item.charge });
      const idle = await addInvoice(fx.tenantId, fx.studentId, fx.subscriptionId, "2026-05-15", "idle");
      const blocked = await cancelSubscription({
        tenantId: fx.tenantId, studentId: fx.studentId, subscriptionId: fx.subscriptionId,
        actorUserId: fx.actor, reason: item.charge, now,
      });
      expect(blocked.ok).toBe(false);
      if (!blocked.ok) expect(blocked.http).toBe(409);
      expect((await snapshot(pending.id, fx.subscriptionId)).invoice).toMatchObject({
        status: "open", gateway: "pending", externalId: item.charge,
      });
      expect((await snapshot(idle.id, fx.subscriptionId)).invoice?.status).toBe("open");
      expect((await snapshot(idle.id, fx.subscriptionId)).sub?.active).toBe(true);
    }
  });

  it("timeout desconhecido não reenvia e o cancelamento continua bloqueado", async () => {
    const fx = await academy("unk");
    const invoice = await addInvoice(fx.tenantId, fx.studentId, fx.subscriptionId, "2026-02-15", "pending", {
      attemptKey: "stone:attempt:1",
    });
    expect(await reserveStoneChargeSlot(fx.tenantId, invoice.id)).toBe("hold_unknown");
    expect(await reserveStoneChargeSlot(fx.tenantId, invoice.id)).toBe("hold_unknown");
    const blocked = await cancelSubscription({
      tenantId: fx.tenantId, studentId: fx.studentId, subscriptionId: fx.subscriptionId,
      actorUserId: fx.actor, reason: "resultado desconhecido", now,
    });
    expect(blocked.ok).toBe(false);
    expect((await snapshot(invoice.id, fx.subscriptionId)).invoice).toMatchObject({
      status: "open", gateway: "pending", attemptKey: "stone:attempt:1",
    });
  });

  it("confirmação depois do cancelamento fica registrada e não reativa", async () => {
    const fx = await academy("late");
    const invoice = await addInvoice(fx.tenantId, fx.studentId, fx.subscriptionId, "2026-06-15", "idle");
    const canceled = await cancelSubscription({
      tenantId: fx.tenantId, studentId: fx.studentId, subscriptionId: fx.subscriptionId,
      actorUserId: fx.actor, reason: "encerra antes do pagamento", now,
    });
    expect(canceled.ok).toBe(true);
    await withBypassRlsTransaction(async (tx) => {
      await tx.update(invoices).set({ externalId: "ch_late" }).where(eq(invoices.id, invoice.id));
    });
    const payload = {
      tenantId: fx.tenantId, provider: "stone" as const, type: "invoice.paid" as const,
      invoiceId: invoice.id, chargeId: "ch_late", amountCents: 9000, currency: "BRL",
    };
    await processWebhookJob({ ...payload, eventId: "evt_late" });
    await processWebhookJob({ ...payload, eventId: "evt_late_2" });
    const row = await snapshot(invoice.id, fx.subscriptionId);
    const conflicts = await withBypassRlsTransaction(async (tx) => {
      return tx.select({ id: paymentConflicts.id }).from(paymentConflicts).where(eq(paymentConflicts.invoiceId, invoice.id));
    });
    expect(row.invoice).toMatchObject({ status: "void", externalId: "ch_late" });
    expect(row.sub?.active).toBe(false);
    expect(conflicts).toHaveLength(1);
  });
});
