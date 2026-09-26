import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { evaluateStudentAccess } from "@/lib/access/gate";
import { feeAccessEffectForPlan } from "@/lib/billing/access-effect";
import { invoices, plans, studentSubscriptions, students } from "@/lib/db/schema";
import { withBypassRlsTransaction, withTenantTransaction } from "@/lib/db/with-tenant";
import { effectiveStudentStatusSql } from "@/lib/services/student-effective-status";
import { createTenantWithAdmin } from "@/lib/services/onboarding/create-tenant";

async function academy(prefix: string) {
  const suffix = randomUUID().slice(0, 8);
  const created = await createTenantWithAdmin({
    name: `${prefix} ${suffix}`,
    slug: `${prefix}-${suffix}`,
    adminEmail: `${prefix}-${suffix}@example.com`,
    adminPassword: "senha-segura-12",
  });
  return created.tenant.id;
}

describe("taxas e acesso", () => {
  it("bloqueia matrícula vencida e mantém nutricionista vencida só no financeiro", async () => {
    const tenantId = await academy("taxas");
    const now = new Date("2026-09-25T12:00:00.000Z");
    const yesterday = new Date("2026-09-24T15:00:00.000Z");
    const today = new Date("2026-09-25T15:00:00.000Z");
    const ids = await withBypassRlsTransaction(async (tx) => {
      const [plan] = await tx
        .insert(plans)
        .values({
          tenantId,
          name: "Mensal",
          priceCents: 12400,
          billingInterval: "monthly",
          kind: "subscription",
        })
        .returning({ id: plans.id });
      const [enrollment] = await tx
        .insert(plans)
        .values({
          tenantId,
          name: "Matrícula",
          code: "taxa-matricula-academia",
          priceCents: 3000,
          billingInterval: "monthly",
          kind: "fee",
          accessEffect: "block",
        })
        .returning({ id: plans.id });
      const [nutrition] = await tx
        .insert(plans)
        .values({
          tenantId,
          name: "Nutricionista",
          code: "taxa-nutricionista",
          priceCents: 20000,
          billingInterval: "monthly",
          kind: "fee",
          accessEffect: "none",
        })
        .returning({ id: plans.id });
      const [member] = await tx
        .insert(students)
        .values({ tenantId, fullName: "Aluno", cpf: "15350946056", status: "active" })
        .returning({ id: students.id });
      await tx.insert(studentSubscriptions).values({
        tenantId,
        studentId: member!.id,
        planId: plan!.id,
        active: true,
        priceCents: 12400,
        billingInterval: "monthly",
        startsAt: new Date("2026-09-01T15:00:00.000Z"),
        endsAt: new Date("2026-10-01T02:59:59.999Z"),
      });
      const [nutritionInvoice] = await tx
        .insert(invoices)
        .values({
          tenantId,
          studentId: member!.id,
          amountCents: 20000,
          status: "open",
          dueAt: yesterday,
          purpose: "fee",
          accessEffect: "none",
          idempotencyKey: `fee:${nutrition!.id}:${randomUUID()}`,
        })
        .returning({ id: invoices.id });
      const [enrollmentInvoice] = await tx
        .insert(invoices)
        .values({
          tenantId,
          studentId: member!.id,
          amountCents: 3000,
          status: "open",
          dueAt: today,
          purpose: "fee",
          accessEffect: "block",
          idempotencyKey: `fee:${enrollment!.id}:${randomUUID()}`,
        })
        .returning({ id: invoices.id });
      return {
        member: member!.id,
        nutrition: nutrition!.id,
        nutritionInvoice: nutritionInvoice!.id,
        enrollmentInvoice: enrollmentInvoice!.id,
      };
    });

    const onDueDay = await withTenantTransaction(tenantId, async (tx) => {
      const access = await evaluateStudentAccess(tx, tenantId, ids.member, now);
      const [status] = await tx
        .select({ status: effectiveStudentStatusSql(now) })
        .from(students)
        .where(eq(students.id, ids.member));
      const [openFee] = await tx
        .select({ status: invoices.status })
        .from(invoices)
        .where(eq(invoices.id, ids.nutritionInvoice));
      return { access, status, openFee };
    });
    expect(onDueDay.access.allowed).toBe(true);
    expect(onDueDay.status?.status).toBe("active");
    expect(onDueDay.openFee?.status).toBe("open");

    await withBypassRlsTransaction(async (tx) => {
      await tx
        .update(invoices)
        .set({ dueAt: yesterday })
        .where(eq(invoices.id, ids.enrollmentInvoice));
    });
    const lateEnrollment = await withTenantTransaction(tenantId, async (tx) => {
      const access = await evaluateStudentAccess(tx, tenantId, ids.member, now);
      const [status] = await tx
        .select({ status: effectiveStudentStatusSql(now) })
        .from(students)
        .where(eq(students.id, ids.member));
      return { access, status };
    });
    expect(lateEnrollment.access.allowed).toBe(false);
    expect(lateEnrollment.access.internalReason).toBe("inadimplente");
    expect(lateEnrollment.status?.status).toBe("delinquent");

    await withBypassRlsTransaction(async (tx) => {
      await tx
        .update(invoices)
        .set({ status: "paid", paidAt: now })
        .where(eq(invoices.id, ids.enrollmentInvoice));
      await tx.insert(invoices).values({
        tenantId,
        studentId: ids.member,
        amountCents: 12400,
        status: "open",
        dueAt: yesterday,
        purpose: "subscription",
        idempotencyKey: `sub:${randomUUID()}:2026-09-24`,
      });
    });
    const lateSubscription = await withTenantTransaction(tenantId, (tx) =>
      evaluateStudentAccess(tx, tenantId, ids.member, now),
    );
    expect(lateSubscription.allowed).toBe(false);
    expect(lateSubscription.internalReason).toBe("inadimplente");

    const other = await academy("outra");
    const otherStudent = await withBypassRlsTransaction(async (tx) => {
      const [plan] = await tx
        .insert(plans)
        .values({
          tenantId: other,
          name: "Mensal",
          priceCents: 12400,
          billingInterval: "monthly",
          kind: "subscription",
        })
        .returning({ id: plans.id });
      const [student] = await tx
        .insert(students)
        .values({ tenantId: other, fullName: "Outra", cpf: "39053344705", status: "active" })
        .returning({ id: students.id });
      await tx.insert(studentSubscriptions).values({
        tenantId: other,
        studentId: student!.id,
        planId: plan!.id,
        active: true,
        priceCents: 12400,
        billingInterval: "monthly",
        startsAt: new Date("2026-09-01T15:00:00.000Z"),
        endsAt: new Date("2026-10-01T02:59:59.999Z"),
      });
      return student!.id;
    });
    const isolated = await withTenantTransaction(other, (tx) =>
      evaluateStudentAccess(tx, other, otherStudent, now),
    );
    expect(isolated.allowed).toBe(true);

    const snap = await withBypassRlsTransaction(async (tx) => {
      const effect = await feeAccessEffectForPlan(tx, tenantId, ids.nutrition);
      await tx.update(plans).set({ accessEffect: "block" }).where(eq(plans.id, ids.nutrition));
      const [row] = await tx
        .select({ accessEffect: invoices.accessEffect })
        .from(invoices)
        .where(eq(invoices.id, ids.nutritionInvoice));
      return { effect, stored: row?.accessEffect };
    });
    expect(snap.effect).toBe("none");
    expect(snap.stored).toBe("none");
  });

  it("mantém o bloqueio da taxa antiga sem classificação", async () => {
    const tenantId = await academy("legado");
    const now = new Date("2026-09-25T12:00:00.000Z");
    const studentId = await withBypassRlsTransaction(async (tx) => {
      const [plan] = await tx
        .insert(plans)
        .values({
          tenantId,
          name: "Mensal",
          priceCents: 12400,
          billingInterval: "monthly",
          kind: "subscription",
        })
        .returning({ id: plans.id });
      const [student] = await tx
        .insert(students)
        .values({ tenantId, fullName: "Legado", cpf: "15350946056", status: "active" })
        .returning({ id: students.id });
      await tx.insert(studentSubscriptions).values({
        tenantId,
        studentId: student!.id,
        planId: plan!.id,
        active: true,
        priceCents: 12400,
        billingInterval: "monthly",
        startsAt: new Date("2026-09-01T15:00:00.000Z"),
        endsAt: new Date("2026-10-01T02:59:59.999Z"),
      });
      await tx.insert(invoices).values({
        tenantId,
        studentId: student!.id,
        amountCents: 3000,
        status: "open",
        dueAt: new Date("2026-09-24T15:00:00.000Z"),
        purpose: "fee",
        idempotencyKey: `fee:${randomUUID()}:${randomUUID()}`,
      });
      return student!.id;
    });
    const access = await withTenantTransaction(tenantId, (tx) =>
      evaluateStudentAccess(tx, tenantId, studentId, now),
    );
    expect(access.allowed).toBe(false);
    expect(access.internalReason).toBe("inadimplente");
  });
});
