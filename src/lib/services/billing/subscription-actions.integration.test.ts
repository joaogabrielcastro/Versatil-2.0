import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { invoices, studentSubscriptions, students } from "@/lib/db/schema";
import { withBypassRlsTransaction, withTenantTransaction } from "@/lib/db/with-tenant";
import { evaluateStudentAccess } from "@/lib/access/gate";
import {
  cancelSubscription,
  renewTerm,
  schedulePlanChange,
} from "@/lib/services/billing/subscription-actions";
import { createTenantWithAdmin } from "@/lib/services/onboarding/create-tenant";

async function fixture() {
  const suffix = randomUUID().slice(0, 8);
  const created = await createTenantWithAdmin({
    name: `Ciclo ${suffix}`,
    slug: `ciclo-${suffix}`,
    adminEmail: `ciclo-${suffix}@example.com`,
    adminPassword: "senha-segura-12",
  });
  const tenantId = created.tenant.id;
  const ids = await withBypassRlsTransaction(async (tx) => {
    const [plan] = await tx.insert((await import("@/lib/db/schema")).plans).values({
      tenantId,
      name: "Mensal",
      priceCents: 10000,
      billingInterval: "monthly",
    }).returning();
    const [other] = await tx.insert((await import("@/lib/db/schema")).plans).values({
      tenantId,
      name: "Anual",
      priceCents: 80000,
      billingInterval: "yearly",
    }).returning();
    const [student] = await tx.insert(students).values({
      tenantId,
      fullName: "Aluno ciclo",
      cpf: suffix,
    }).returning();
    const [sub] = await tx.insert(studentSubscriptions).values({
      tenantId,
      studentId: student!.id,
      planId: plan!.id,
      priceCents: 10000,
      billingInterval: "monthly",
      startsAt: new Date("2026-01-15T15:00:00.000Z"),
      endsAt: new Date("2026-06-15T15:00:00.000Z"),
      active: true,
    }).returning();
    const [paid] = await tx.insert(invoices).values({
      tenantId,
      studentId: student!.id,
      amountCents: 10000,
      status: "paid",
      dueAt: new Date("2026-01-15T15:00:00.000Z"),
      paidAt: new Date("2026-01-15T15:00:00.000Z"),
      idempotencyKey: `sub:${sub!.id}:2026-01-15`,
      purpose: "subscription",
    }).returning();
    await tx.insert(invoices).values({
      tenantId,
      studentId: student!.id,
      amountCents: 3000,
      status: "paid",
      dueAt: new Date("2026-01-20T15:00:00.000Z"),
      paidAt: new Date("2026-01-20T15:00:00.000Z"),
      idempotencyKey: `fee:${plan!.id}:taxa-paga`,
      purpose: "fee",
    });
    const [future] = await tx.insert(invoices).values({
      tenantId,
      studentId: student!.id,
      amountCents: 10000,
      status: "open",
      dueAt: new Date("2026-02-15T15:00:00.000Z"),
      idempotencyKey: `sub:${sub!.id}:2026-02-15`,
    }).returning();
    return { plan: plan!.id, other: other!.id, student: student!.id, sub: sub!.id, paid: paid!.id, future: future!.id };
  });
  return { tenantId, actor: created.admin.id, ...ids };
}

describe("ações de assinatura", () => {
  it("cancela no fim do período pago, preserva a fatura paga e anula a futura", async () => {
    const fx = await fixture();
    const now = new Date("2026-01-20T15:00:00.000Z");
    const first = await cancelSubscription({
      tenantId: fx.tenantId,
      studentId: fx.student,
      subscriptionId: fx.sub,
      actorUserId: fx.actor,
      reason: "mudou de cidade",
      now,
    });
    expect(first.ok).toBe(true);
    const second = await cancelSubscription({
      tenantId: fx.tenantId,
      studentId: fx.student,
      subscriptionId: fx.sub,
      actorUserId: fx.actor,
      reason: "de novo",
      now,
    });
    expect(second.ok).toBe(true);
    if (second.ok) expect(second.detail.repeated).toBe(true);

    const rows = await withTenantTransaction(fx.tenantId, async (tx) => {
      return tx.select({ id: invoices.id, status: invoices.status }).from(invoices);
    });
    expect(rows.find((row) => row.id === fx.paid)?.status).toBe("paid");
    expect(rows.find((row) => row.id === fx.future)?.status).toBe("void");

    const [ended] = await withTenantTransaction(fx.tenantId, async (tx) => {
      return tx
        .select({ endsAt: studentSubscriptions.endsAt })
        .from(studentSubscriptions)
        .where(eq(studentSubscriptions.id, fx.sub));
    });
    expect(ended?.endsAt?.toISOString()).toBe("2026-02-15T02:59:59.999Z");

    const access = await withTenantTransaction(fx.tenantId, async (tx) => {
      return evaluateStudentAccess(tx, fx.tenantId, fx.student, now);
    });
    expect(access.allowed).toBe(true);
    const lastCovered = await withTenantTransaction(fx.tenantId, async (tx) => {
      return evaluateStudentAccess(
        tx,
        fx.tenantId,
        fx.student,
        new Date("2026-02-15T02:59:59.999Z"),
      );
    });
    expect(lastCovered.allowed).toBe(true);
    const nextMorning = await withTenantTransaction(fx.tenantId, async (tx) => {
      return evaluateStudentAccess(
        tx,
        fx.tenantId,
        fx.student,
        new Date("2026-02-15T03:00:00.000Z"),
      );
    });
    expect(nextMorning.allowed).toBe(false);

    const other = await createTenantWithAdmin({
      name: "Outra",
      slug: `outra-${randomUUID().slice(0, 8)}`,
      adminEmail: `outra-${randomUUID().slice(0, 8)}@example.com`,
      adminPassword: "senha-segura-12",
    });
    const cross = await cancelSubscription({
      tenantId: other.tenant.id,
      studentId: fx.student,
      subscriptionId: fx.sub,
      actorUserId: other.admin.id,
      reason: "invasão",
    });
    expect(cross.ok).toBe(false);
  });

  it("impede troca quando o próximo ciclo está pago e aceita renovação manual", async () => {
    const fx = await fixture();
    await withBypassRlsTransaction(async (tx) => {
      await tx
        .update(invoices)
        .set({ status: "paid", paidAt: new Date("2026-02-15T15:00:00.000Z") })
        .where(eq(invoices.id, fx.future));
    });
    const change = await schedulePlanChange({
      tenantId: fx.tenantId,
      studentId: fx.student,
      subscriptionId: fx.sub,
      planId: fx.other,
      now: new Date("2026-01-20T15:00:00.000Z"),
    });
    expect(change.ok).toBe(false);

    const renewed = await renewTerm({
      tenantId: fx.tenantId,
      studentId: fx.student,
      subscriptionId: fx.sub,
      actorUserId: fx.actor,
      endsAt: new Date("2026-12-15T15:00:00.000Z"),
      planId: fx.other,
    });
    expect(renewed.ok).toBe(true);
    const [sub] = await withTenantTransaction(fx.tenantId, async (tx) => {
      return tx
        .select({ price: studentSubscriptions.priceCents, ends: studentSubscriptions.endsAt })
        .from(studentSubscriptions)
        .where(eq(studentSubscriptions.id, fx.sub));
    });
    expect(sub?.price).toBe(10000);
    expect(sub?.ends?.toISOString()).toBe("2026-06-15T15:00:00.000Z");
  });

  it("duas solicitações simultâneas não anulam duas vezes", async () => {
    const fx = await fixture();
    const now = new Date("2026-01-20T15:00:00.000Z");
    const [a, b] = await Promise.all([
      cancelSubscription({
        tenantId: fx.tenantId,
        studentId: fx.student,
        subscriptionId: fx.sub,
        actorUserId: fx.actor,
        reason: "primeira",
        now,
      }),
      cancelSubscription({
        tenantId: fx.tenantId,
        studentId: fx.student,
        subscriptionId: fx.sub,
        actorUserId: fx.actor,
        reason: "segunda",
        now,
      }),
    ]);
    expect(a.ok && b.ok).toBe(true);
    const rows = await withTenantTransaction(fx.tenantId, async (tx) => {
      return tx
        .select({ status: invoices.status })
        .from(invoices)
        .where(eq(invoices.studentId, fx.student));
    });
    expect(rows.filter((row) => row.status === "void")).toHaveLength(1);
    expect(rows.filter((row) => row.status === "paid")).toHaveLength(2);
  });
});
