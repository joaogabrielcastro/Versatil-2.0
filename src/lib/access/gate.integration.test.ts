import { randomUUID } from "crypto";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { evaluateStudentAccess, PUBLIC_ACCESS_DENIAL } from "@/lib/access/gate";
import { accessEvents, invoices, plans, studentSubscriptions, students } from "@/lib/db/schema";
import { withBypassRlsTransaction, withTenantTransaction } from "@/lib/db/with-tenant";
import { createTenantWithAdmin } from "@/lib/services/onboarding/create-tenant";

describe("decisão da catraca no momento do acesso", () => {
  it("libera quem está em dia e nega plano vencido ou fatura vencida, mesmo com status gravado ao contrário", async () => {
    const suffix = randomUUID().slice(0, 8);
    const created = await createTenantWithAdmin({
      name: `Catraca ${suffix}`,
      slug: `catraca-${suffix}`,
      adminEmail: `cat-${suffix}@example.com`,
      adminPassword: "senha-segura-12",
    });
    const tenantId = created.tenant.id;
    const now = new Date("2026-09-25T12:00:00.000Z");
    const ids = await withBypassRlsTransaction(async (tx) => {
      const [plan] = await tx
        .insert(plans)
        .values({ tenantId, name: "Mensal", priceCents: 9900, billingInterval: "monthly" })
        .returning({ id: plans.id });
      const [okStudent] = await tx
        .insert(students)
        .values({ tenantId, fullName: "Em dia", cpf: "11144477735", status: "inactive" })
        .returning({ id: students.id });
      const [expired] = await tx
        .insert(students)
        .values({ tenantId, fullName: "Vencido", cpf: "22233344455", status: "active" })
        .returning({ id: students.id });
      const [debtor] = await tx
        .insert(students)
        .values({ tenantId, fullName: "Devendo", cpf: "33344455566", status: "active" })
        .returning({ id: students.id });
      await tx.insert(studentSubscriptions).values({
        tenantId,
        studentId: okStudent!.id,
        planId: plan!.id,
        active: true,
        priceCents: 1000,
        billingInterval: "monthly",
        startsAt: new Date("2026-09-01T00:00:00.000Z"),
        endsAt: new Date("2026-10-01T00:00:00.000Z"),
      });
      await tx.insert(studentSubscriptions).values({
        tenantId,
        studentId: expired!.id,
        planId: plan!.id,
        active: true,
        priceCents: 1000,
        billingInterval: "monthly",
        startsAt: new Date("2026-08-01T00:00:00.000Z"),
        endsAt: new Date("2026-09-01T00:00:00.000Z"),
      });
      await tx.insert(studentSubscriptions).values({
        tenantId,
        studentId: debtor!.id,
        planId: plan!.id,
        active: true,
        priceCents: 1000,
        billingInterval: "monthly",
        startsAt: new Date("2026-09-01T00:00:00.000Z"),
        endsAt: new Date("2026-10-01T00:00:00.000Z"),
      });
      await tx.insert(invoices).values({
        tenantId,
        studentId: debtor!.id,
        amountCents: 9900,
        currency: "BRL",
        status: "open",
        dueAt: new Date("2026-09-10T00:00:00.000Z"),
      });
      return { ok: okStudent!.id, expired: expired!.id, debtor: debtor!.id };
    });

    const decisions = await withTenantTransaction(tenantId, async (tx) => {
      const [current, lapsed, late] = await Promise.all([
        evaluateStudentAccess(tx, tenantId, ids.ok, now),
        evaluateStudentAccess(tx, tenantId, ids.expired, now),
        evaluateStudentAccess(tx, tenantId, ids.debtor, now),
      ]);
      await tx.insert(accessEvents).values({
        tenantId,
        studentId: ids.expired,
        allowed: false,
        reason: lapsed.internalReason,
      });
      return { current, lapsed, late };
    });

    expect(decisions.current.allowed).toBe(true);
    expect(decisions.lapsed.allowed).toBe(false);
    expect(decisions.lapsed.internalReason).toBe("inativo");
    expect(decisions.late.allowed).toBe(false);
    expect(decisions.late.internalReason).toBe("inadimplente");
    expect(PUBLIC_ACCESS_DENIAL).not.toMatch(/inadimplente|inativo/);

    const logged = await withTenantTransaction(tenantId, async (tx) => {
      return tx
        .select({ reason: accessEvents.reason })
        .from(accessEvents)
        .where(and(eq(accessEvents.tenantId, tenantId), eq(accessEvents.studentId, ids.expired)));
    });
    expect(logged[0]?.reason).toBe("inativo");
  });

  it("não trata como vencida a fatura do dia civil e bloqueia a partir do dia seguinte", async () => {
    const suffix = randomUUID().slice(0, 8);
    const created = await createTenantWithAdmin({
      name: `Vencimento ${suffix}`,
      slug: `venc-${suffix}`,
      adminEmail: `venc-${suffix}@example.com`,
      adminPassword: "senha-segura-12",
    });
    const tenantId = created.tenant.id;
    const dueToday = new Date("2026-09-25T15:00:00.000Z");
    const studentId = await withBypassRlsTransaction(async (tx) => {
      const [plan] = await tx
        .insert(plans)
        .values({ tenantId, name: "Mensal", priceCents: 9900, billingInterval: "monthly" })
        .returning({ id: plans.id });
      const [student] = await tx
        .insert(students)
        .values({ tenantId, fullName: "Vence hoje", cpf: `v${suffix}`, status: "delinquent" })
        .returning({ id: students.id });
      await tx.insert(studentSubscriptions).values({
        tenantId,
        studentId: student!.id,
        planId: plan!.id,
        active: true,
        priceCents: 9900,
        billingInterval: "monthly",
        startsAt: new Date("2026-09-25T03:00:00.000Z"),
        endsAt: new Date("2026-10-25T13:00:00.000Z"),
      });
      await tx.insert(invoices).values({
        tenantId,
        studentId: student!.id,
        amountCents: 9900,
        currency: "BRL",
        status: "open",
        dueAt: dueToday,
      });
      return student!.id;
    });

    const sameMorning = await withTenantTransaction(tenantId, (tx) =>
      evaluateStudentAccess(tx, tenantId, studentId, new Date("2026-09-25T12:00:00.000Z")),
    );
    const afterStoredClock = await withTenantTransaction(tenantId, (tx) =>
      evaluateStudentAccess(tx, tenantId, studentId, new Date("2026-09-25T18:00:00.000Z")),
    );
    const nextCivilDay = await withTenantTransaction(tenantId, (tx) =>
      evaluateStudentAccess(tx, tenantId, studentId, new Date("2026-09-26T03:00:00.000Z")),
    );

    expect(sameMorning.allowed).toBe(true);
    expect(afterStoredClock.allowed).toBe(true);
    expect(nextCivilDay.allowed).toBe(false);
    expect(nextCivilDay.internalReason).toBe("inadimplente");
  });
});
