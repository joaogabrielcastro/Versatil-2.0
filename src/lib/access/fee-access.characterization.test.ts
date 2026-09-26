import { randomUUID } from "crypto";
import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { evaluateStudentAccess } from "@/lib/access/gate";
import { invoices, plans, studentSubscriptions, students } from "@/lib/db/schema";
import { withBypassRlsTransaction, withTenantTransaction } from "@/lib/db/with-tenant";
import { effectiveStudentStatusSql } from "@/lib/services/student-effective-status";
import { createTenantWithAdmin } from "@/lib/services/onboarding/create-tenant";

/**
 * Taxa sem access_effect continua bloqueando, e aula avulsa paga
 * ainda não abre a catraca de quem não tem contrato.
 */
describe("caracterização de taxas e aula avulsa", () => {
  it("trata taxa vencida como inadimplência e não libera aula avulsa paga sem contrato", async () => {
    const suffix = randomUUID().slice(0, 8);
    const created = await createTenantWithAdmin({
      name: `Taxas ${suffix}`,
      slug: `taxas-${suffix}`,
      adminEmail: `taxas-${suffix}@example.com`,
      adminPassword: "senha-segura-12",
    });
    const tenantId = created.tenant.id;
    const now = new Date("2026-09-25T12:00:00.000Z");
    const dueYesterday = new Date("2026-09-24T15:00:00.000Z");
    const dueToday = new Date("2026-09-25T15:00:00.000Z");

    const ids = await withBypassRlsTransaction(async (tx) => {
      const [plan] = await tx
        .insert(plans)
        .values({
          tenantId,
          name: "Mensal",
          code: "academia-mensal",
          priceCents: 12400,
          billingInterval: "monthly",
          kind: "subscription",
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
        })
        .returning({ id: plans.id });
      const [dropIn] = await tx
        .insert(plans)
        .values({
          tenantId,
          name: "Aula avulsa CrossFit",
          code: "taxa-aula-avulsa-crossfit",
          priceCents: 4000,
          billingInterval: "monthly",
          kind: "fee",
        })
        .returning({ id: plans.id });

      const [member] = await tx
        .insert(students)
        .values({ tenantId, fullName: "Com contrato", cpf: "15350946056", status: "active" })
        .returning({ id: students.id });
      const [visitor] = await tx
        .insert(students)
        .values({ tenantId, fullName: "Sem contrato", cpf: "39053344705", status: "inactive" })
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
      const [overdueFee] = await tx
        .insert(invoices)
        .values({
          tenantId,
          studentId: member!.id,
          amountCents: 20000,
          status: "open",
          dueAt: dueYesterday,
          purpose: "fee",
          idempotencyKey: `fee:${nutrition!.id}:${randomUUID()}`,
        })
        .returning({ id: invoices.id });
      await tx.insert(invoices).values({
        tenantId,
        studentId: visitor!.id,
        amountCents: 4000,
        status: "paid",
        dueAt: dueToday,
        paidAt: now,
        purpose: "fee",
        idempotencyKey: `fee:${dropIn!.id}:${randomUUID()}`,
      });

      return { member: member!.id, visitor: visitor!.id, overdueFee: overdueFee!.id };
    });

    const before = await withTenantTransaction(tenantId, async (tx) => {
      const member = await evaluateStudentAccess(tx, tenantId, ids.member, now);
      const visitor = await evaluateStudentAccess(tx, tenantId, ids.visitor, now);
      const again = await evaluateStudentAccess(tx, tenantId, ids.visitor, now);
      const [memberStatus] = await tx
        .select({ status: effectiveStudentStatusSql(now) })
        .from(students)
        .where(eq(students.id, ids.member));
      const [visitorStatus] = await tx
        .select({ status: effectiveStudentStatusSql(now) })
        .from(students)
        .where(eq(students.id, ids.visitor));
      const [{ total }] = await tx
        .select({ total: sql<number>`count(*)::int` })
        .from(invoices)
        .where(eq(invoices.tenantId, tenantId));
      return { member, visitor, again, memberStatus, visitorStatus, total };
    });

    expect(before.member.allowed).toBe(false);
    expect(before.member.internalReason).toBe("inadimplente");
    expect(before.memberStatus?.status).toBe("delinquent");
    expect(before.visitor.allowed).toBe(false);
    expect(before.visitor.internalReason).toBe("inativo");
    expect(before.visitorStatus?.status).toBe("inactive");
    expect(before.again).toEqual(before.visitor);
    expect(before.total).toBe(2);

    await withBypassRlsTransaction(async (tx) => {
      await tx.update(invoices).set({ dueAt: dueToday }).where(eq(invoices.id, ids.overdueFee));
    });

    const onDueDay = await withTenantTransaction(tenantId, async (tx) => {
      const access = await evaluateStudentAccess(tx, tenantId, ids.member, now);
      const [status] = await tx
        .select({ status: effectiveStudentStatusSql(now) })
        .from(students)
        .where(eq(students.id, ids.member));
      return { access, status };
    });

    expect(onDueDay.access.allowed).toBe(true);
    expect(onDueDay.status?.status).toBe("active");
  });
});
