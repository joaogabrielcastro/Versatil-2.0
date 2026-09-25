import { randomUUID } from "crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { and, eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { evaluateStudentAccess } from "@/lib/access/gate";
import {
  billingReviews,
  invoices,
  plans,
  studentSubscriptions,
  students,
  subscriptionTerms,
} from "@/lib/db/schema";
import { withBypassRlsTransaction, withTenantTransaction } from "@/lib/db/with-tenant";
import { cancelSubscription, renewTerm } from "@/lib/services/billing/subscription-actions";
import { generateSubscriptionInvoicesForTenant } from "@/lib/services/billing/subscription-invoice";
import { effectiveStudentStatusSql } from "@/lib/services/student-effective-status";
import { createTenantWithAdmin } from "@/lib/services/onboarding/create-tenant";

const previousEnd = new Date("2026-12-25T02:59:59.999Z");
const renewalStart = new Date("2026-12-25T03:00:00.000Z");
const firstDue = new Date("2026-12-25T15:00:00.000Z");
const renewalEnd = new Date("2027-03-25T02:59:59.999Z");

async function fixture(priceCents = 13400, interval: "monthly" | "quarterly" = "monthly") {
  const suffix = randomUUID().slice(0, 8);
  const created = await createTenantWithAdmin({
    name: `Renovação ${suffix}`,
    slug: `renova-${suffix}`,
    adminEmail: `renova-${suffix}@example.com`,
    adminPassword: "senha-segura-12",
  });
  const tenantId = created.tenant.id;
  const ids = await withBypassRlsTransaction(async (tx) => {
    const [plan] = await tx.insert(plans).values({
      tenantId,
      name: interval === "monthly" ? "Trimestral parcelado" : "À vista",
      priceCents,
      billingInterval: interval,
      termMonths: 3,
    }).returning();
    const [student] = await tx.insert(students).values({
      tenantId,
      fullName: "Aluno renovação",
      cpf: `r${suffix}`,
    }).returning();
    const [sub] = await tx.insert(studentSubscriptions).values({
      tenantId,
      studentId: student!.id,
      planId: plan!.id,
      priceCents,
      billingInterval: interval,
      startsAt: new Date("2026-09-25T15:00:00.000Z"),
      endsAt: previousEnd,
      active: true,
    }).returning();
    await tx.insert(subscriptionTerms).values({
      tenantId,
      subscriptionId: sub!.id,
      planId: plan!.id,
      priceCents,
      billingInterval: interval,
      startsAt: new Date("2026-09-25T15:00:00.000Z"),
      endsAt: previousEnd,
      validFrom: new Date("2026-09-25T15:00:00.000Z"),
      source: "contract",
    });
    return { planId: plan!.id, studentId: student!.id, subscriptionId: sub!.id };
  });
  return { tenantId, actorId: created.admin.id, ...ids };
}

async function renewalInvoices(tenantId: string) {
  return withBypassRlsTransaction(async (tx) => {
    return tx
      .select({
        amountCents: invoices.amountCents,
        dueAt: invoices.dueAt,
        status: invoices.status,
        purpose: invoices.purpose,
      })
      .from(invoices)
      .where(eq(invoices.tenantId, tenantId));
  });
}

describe("renovação integrada ao faturamento", () => {
  it("mantém o contrato vigente e só fatura a renovação no prazo", async () => {
    const fx = await fixture();
    const renewed = await renewTerm({
      tenantId: fx.tenantId,
      studentId: fx.studentId,
      subscriptionId: fx.subscriptionId,
      actorUserId: fx.actorId,
      endsAt: renewalEnd,
    });
    expect(renewed.ok).toBe(true);
    if (renewed.ok) {
      expect(new Date(renewed.detail.startsAt as string).toISOString()).toBe(
        renewalStart.toISOString(),
      );
    }

    const [sub] = await withTenantTransaction(fx.tenantId, async (tx) => {
      return tx
        .select({
          price: studentSubscriptions.priceCents,
          ends: studentSubscriptions.endsAt,
          interval: studentSubscriptions.billingInterval,
        })
        .from(studentSubscriptions)
        .where(eq(studentSubscriptions.id, fx.subscriptionId));
    });
    expect(sub?.price).toBe(13400);
    expect(sub?.ends?.toISOString()).toBe(previousEnd.toISOString());
    expect(sub?.interval).toBe("monthly");

    await withBypassRlsTransaction(async (tx) => {
      await tx.update(plans).set({ priceCents: 99900 }).where(eq(plans.id, fx.planId));
    });
    const early = await generateSubscriptionInvoicesForTenant(
      fx.tenantId,
      new Date("2026-09-25T15:00:00.000Z"),
    );
    expect(
      (await renewalInvoices(fx.tenantId)).some(
        (row) => row.dueAt?.toISOString() === firstDue.toISOString(),
      ),
    ).toBe(false);
    expect(early.created).toBeGreaterThan(0);
    await withBypassRlsTransaction(async (tx) => {
      await tx
        .update(invoices)
        .set({ status: "paid", paidAt: new Date("2026-09-25T15:00:00.000Z") })
        .where(eq(invoices.tenantId, fx.tenantId));
    });

    const duringOriginal = await withTenantTransaction(fx.tenantId, (tx) =>
      evaluateStudentAccess(tx, fx.tenantId, fx.studentId, previousEnd),
    );
    expect(duringOriginal.allowed).toBe(true);
    const atRenewalStart = await withTenantTransaction(fx.tenantId, (tx) =>
      evaluateStudentAccess(tx, fx.tenantId, fx.studentId, renewalStart),
    );
    expect(atRenewalStart.allowed).toBe(false);
    expect(atRenewalStart.internalReason).toBe("faturamento_pendente");
  });

  it("gera a primeira fatura e os ciclos seguintes sem passar do fim", async () => {
    const fx = await fixture();
    await renewTerm({
      tenantId: fx.tenantId,
      studentId: fx.studentId,
      subscriptionId: fx.subscriptionId,
      actorUserId: fx.actorId,
      endsAt: renewalEnd,
    });
    const first = await generateSubscriptionInvoicesForTenant(fx.tenantId, firstDue);
    expect(first.created).toBeGreaterThan(0);
    const again = await generateSubscriptionInvoicesForTenant(fx.tenantId, firstDue);
    expect(again.created).toBe(0);

    await generateSubscriptionInvoicesForTenant(fx.tenantId, new Date("2027-02-20T15:00:00.000Z"));
    const dues = (await renewalInvoices(fx.tenantId))
      .map((row) => row.dueAt?.toISOString())
      .filter((due) => due && due >= firstDue.toISOString())
      .sort();
    expect(dues).toEqual([
      "2026-12-25T15:00:00.000Z",
      "2027-01-25T15:00:00.000Z",
      "2027-02-25T15:00:00.000Z",
    ]);
    const renewalRows = (await renewalInvoices(fx.tenantId)).filter(
      (row) => row.dueAt?.toISOString() === firstDue.toISOString(),
    );
    expect(renewalRows).toHaveLength(1);
    expect(renewalRows[0]?.amountCents).toBe(13400);
    expect(renewalRows[0]?.purpose).toBe("subscription");
  });

  it("não duplica quando o gerador corre duas vezes ao mesmo tempo", async () => {
    const fx = await fixture();
    await renewTerm({
      tenantId: fx.tenantId,
      studentId: fx.studentId,
      subscriptionId: fx.subscriptionId,
      actorUserId: fx.actorId,
      endsAt: renewalEnd,
    });
    await Promise.all([
      generateSubscriptionInvoicesForTenant(fx.tenantId, firstDue),
      generateSubscriptionInvoicesForTenant(fx.tenantId, firstDue),
    ]);
    const rows = (await renewalInvoices(fx.tenantId)).filter(
      (row) => row.dueAt?.toISOString() === firstDue.toISOString(),
    );
    expect(rows).toHaveLength(1);
  });

  it("à vista gera uma cobrança e a cobertura segue o vencimento", async () => {
    const fx = await fixture(55000, "quarterly");
    await renewTerm({
      tenantId: fx.tenantId,
      studentId: fx.studentId,
      subscriptionId: fx.subscriptionId,
      actorUserId: fx.actorId,
      endsAt: new Date("2027-12-25T02:59:59.999Z"),
    });
    await generateSubscriptionInvoicesForTenant(fx.tenantId, new Date("2027-06-01T15:00:00.000Z"));
    const upfront = (await renewalInvoices(fx.tenantId)).filter(
      (row) => row.amountCents === 55000 && row.dueAt?.toISOString() === firstDue.toISOString(),
    );
    expect(upfront).toHaveLength(1);

    await withBypassRlsTransaction(async (tx) => {
      await tx
        .update(invoices)
        .set({ status: "paid", paidAt: new Date("2026-09-25T15:00:00.000Z") })
        .where(eq(invoices.tenantId, fx.tenantId));
      await tx
        .update(invoices)
        .set({ status: "open", paidAt: null })
        .where(and(eq(invoices.tenantId, fx.tenantId), eq(invoices.dueAt, firstDue)));
    });

    const dueToday = await withTenantTransaction(fx.tenantId, (tx) =>
      evaluateStudentAccess(tx, fx.tenantId, fx.studentId, firstDue),
    );
    expect(dueToday.allowed).toBe(true);
    const nextDay = await withTenantTransaction(fx.tenantId, (tx) =>
      evaluateStudentAccess(tx, fx.tenantId, fx.studentId, new Date("2026-12-26T03:00:00.000Z")),
    );
    expect(nextDay.allowed).toBe(false);
    expect(nextDay.internalReason).toBe("inadimplente");

    await withBypassRlsTransaction(async (tx) => {
      await tx
        .update(invoices)
        .set({ status: "paid", paidAt: firstDue })
        .where(eq(invoices.tenantId, fx.tenantId));
    });
    const paid = await withTenantTransaction(fx.tenantId, (tx) =>
      evaluateStudentAccess(tx, fx.tenantId, fx.studentId, new Date("2027-06-01T15:00:00.000Z")),
    );
    expect(paid.allowed).toBe(true);
    const afterTerm = await withTenantTransaction(fx.tenantId, (tx) =>
      evaluateStudentAccess(tx, fx.tenantId, fx.studentId, new Date("2027-12-25T03:00:00.000Z")),
    );
    expect(afterTerm.allowed).toBe(false);
    expect(afterTerm.internalReason).toBe("inativo");
  });

  it("cron atrasado recupera a cobrança sem duplicar", async () => {
    const fx = await fixture();
    await renewTerm({
      tenantId: fx.tenantId,
      studentId: fx.studentId,
      subscriptionId: fx.subscriptionId,
      actorUserId: fx.actorId,
      endsAt: renewalEnd,
    });
    const late = await generateSubscriptionInvoicesForTenant(
      fx.tenantId,
      new Date("2027-01-10T15:00:00.000Z"),
    );
    expect(late.created).toBeGreaterThan(0);
    const repeat = await generateSubscriptionInvoicesForTenant(
      fx.tenantId,
      new Date("2027-01-10T15:00:00.000Z"),
    );
    expect(repeat.created).toBe(0);
    const dues = (await renewalInvoices(fx.tenantId))
      .map((row) => row.dueAt?.toISOString())
      .filter((due) => due && due >= firstDue.toISOString());
    expect(dues).toContain(firstDue.toISOString());
    expect(dues).not.toContain("2027-01-25T15:00:00.000Z");
  });

  it("renovação vigente sem fatura não libera a catraca nem parece inadimplência", async () => {
    const fx = await fixture();
    await renewTerm({
      tenantId: fx.tenantId,
      studentId: fx.studentId,
      subscriptionId: fx.subscriptionId,
      actorUserId: fx.actorId,
      endsAt: renewalEnd,
    });
    const before = await renewalInvoices(fx.tenantId);
    const access = await withTenantTransaction(fx.tenantId, (tx) =>
      evaluateStudentAccess(tx, fx.tenantId, fx.studentId, firstDue),
    );
    expect(access.allowed).toBe(false);
    expect(access.internalReason).toBe("faturamento_pendente");
    expect(await renewalInvoices(fx.tenantId)).toHaveLength(before.length);

    const [status] = await withTenantTransaction(fx.tenantId, async (tx) => {
      return tx
        .select({ status: effectiveStudentStatusSql(firstDue) })
        .from(students)
        .where(eq(students.id, fx.studentId));
    });
    expect(status?.status).toBe("inactive");
    const reviews = await withBypassRlsTransaction(async (tx) => {
      return tx
        .select({ reason: billingReviews.reason })
        .from(billingReviews)
        .where(eq(billingReviews.tenantId, fx.tenantId));
    });
    expect(reviews.some((row) => row.reason.includes("Não é inadimplência"))).toBe(true);
  });

  it("não renova contrato cancelado", async () => {
    const fx = await fixture();
    const cancelled = await cancelSubscription({
      tenantId: fx.tenantId,
      studentId: fx.studentId,
      subscriptionId: fx.subscriptionId,
      actorUserId: fx.actorId,
      reason: "encerrou",
      now: new Date("2026-10-01T15:00:00.000Z"),
    });
    expect(cancelled.ok).toBe(true);
    const renewed = await renewTerm({
      tenantId: fx.tenantId,
      studentId: fx.studentId,
      subscriptionId: fx.subscriptionId,
      actorUserId: fx.actorId,
      endsAt: renewalEnd,
    });
    expect(renewed.ok).toBe(false);
  });

  it("não fatura a renovação de outra academia", async () => {
    const left = await fixture();
    const right = await fixture();
    await renewTerm({
      tenantId: left.tenantId,
      studentId: left.studentId,
      subscriptionId: left.subscriptionId,
      actorUserId: left.actorId,
      endsAt: renewalEnd,
    });
    await renewTerm({
      tenantId: right.tenantId,
      studentId: right.studentId,
      subscriptionId: right.subscriptionId,
      actorUserId: right.actorId,
      endsAt: renewalEnd,
    });
    await generateSubscriptionInvoicesForTenant(left.tenantId, firstDue);
    const rightRows = await renewalInvoices(right.tenantId);
    expect(rightRows.some((row) => row.dueAt?.toISOString() === firstDue.toISOString())).toBe(false);
    const cross = await renewTerm({
      tenantId: left.tenantId,
      studentId: right.studentId,
      subscriptionId: right.subscriptionId,
      actorUserId: left.actorId,
      endsAt: renewalEnd,
    });
    expect(cross.ok).toBe(false);
  });

  it("corrige renovação antiga colada no fim do contrato sem criar fatura", async () => {
    const fx = await fixture();
    await withBypassRlsTransaction(async (tx) => {
      await tx.insert(subscriptionTerms).values({
        tenantId: fx.tenantId,
        subscriptionId: fx.subscriptionId,
        planId: fx.planId,
        priceCents: 13400,
        billingInterval: "monthly",
        startsAt: previousEnd,
        endsAt: renewalEnd,
        validFrom: previousEnd,
        source: "renewal",
      });
      const correction = readFileSync(
        path.resolve(process.cwd(), "drizzle/0022_renewal_start_boundary.sql"),
        "utf8",
      );
      await tx.execute(sql.raw(correction));
    });
    const [renewedTerm] = await withBypassRlsTransaction(async (tx) => {
      return tx
        .select({
          startsAt: subscriptionTerms.startsAt,
          price: subscriptionTerms.priceCents,
        })
        .from(subscriptionTerms)
        .where(
          eq(subscriptionTerms.subscriptionId, fx.subscriptionId),
        );
    });
    const rows = await withBypassRlsTransaction(async (tx) => {
      return tx
        .select({ startsAt: subscriptionTerms.startsAt, price: subscriptionTerms.priceCents })
        .from(subscriptionTerms)
        .where(eq(subscriptionTerms.subscriptionId, fx.subscriptionId));
    });
    const legacy = rows.find((row) => row.startsAt.toISOString() === renewalStart.toISOString());
    expect(legacy?.startsAt.toISOString()).toBe(renewalStart.toISOString());
    expect(legacy?.price).toBe(13400);
    expect(renewedTerm).toBeTruthy();
    expect(await renewalInvoices(fx.tenantId)).toHaveLength(0);
  });
});
