import { randomUUID } from "crypto";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { invoices, plans, studentSubscriptions, students } from "@/lib/db/schema";
import { withBypassRlsTransaction, withTenantTransaction } from "@/lib/db/with-tenant";
import {
  countStudentsByEffectiveStatus,
  listStudentsPage,
} from "@/lib/services/student-effective-status";
import { createTenantWithAdmin } from "@/lib/services/onboarding/create-tenant";

describe("situação efetiva na lista", () => {
  it("filtra pelo contrato e pelo dia civil, sem usar o status gravado", async () => {
    const suffix = randomUUID().slice(0, 8);
    const created = await createTenantWithAdmin({
      name: `Lista ${suffix}`,
      slug: `lista-${suffix}`,
      adminEmail: `lista-${suffix}@example.com`,
      adminPassword: "senha-segura-12",
    });
    const other = await createTenantWithAdmin({
      name: `Outra ${suffix}`,
      slug: `outra-${suffix}`,
      adminEmail: `outra-${suffix}@example.com`,
      adminPassword: "senha-segura-12",
    });
    const tenantId = created.tenant.id;
    const dueToday = new Date("2026-09-25T15:00:00.000Z");
    const sameDay = new Date("2026-09-25T18:00:00.000Z");
    const nextDay = new Date("2026-09-26T03:00:00.000Z");

    const ids = await withBypassRlsTransaction(async (tx) => {
      const [plan] = await tx
        .insert(plans)
        .values({ tenantId, name: "Mensal", priceCents: 9900, billingInterval: "monthly" })
        .returning({ id: plans.id });
      const [otherPlan] = await tx
        .insert(plans)
        .values({
          tenantId: other.tenant.id,
          name: "Mensal",
          priceCents: 9900,
          billingInterval: "monthly",
        })
        .returning({ id: plans.id });

      async function add(input: {
        name: string;
        status: "active" | "delinquent" | "inactive";
        tenant?: string;
        planId?: string;
        sub?: { active: boolean; startsAt: Date; endsAt: Date } | null;
        dues?: Date[];
      }) {
        const tid = input.tenant ?? tenantId;
        const [student] = await tx
          .insert(students)
          .values({
            tenantId: tid,
            fullName: input.name,
            cpf: `${input.name}-${suffix}`.replace(/\W/g, "").slice(0, 14),
            status: input.status,
          })
          .returning({ id: students.id });
        if (input.sub && input.planId) {
          await tx.insert(studentSubscriptions).values({
            tenantId: tid,
            studentId: student!.id,
            planId: input.planId,
            active: input.sub.active,
            priceCents: 9900,
            billingInterval: "monthly",
            startsAt: input.sub.startsAt,
            endsAt: input.sub.endsAt,
          });
        }
        for (const dueAt of input.dues ?? []) {
          await tx.insert(invoices).values({
            tenantId: tid,
            studentId: student!.id,
            amountCents: 9900,
            currency: "BRL",
            status: "open",
            dueAt,
          });
        }
        return student!.id;
      }

      const covering = {
        active: true,
        startsAt: new Date("2026-09-01T12:00:00.000Z"),
        endsAt: new Date("2026-10-01T12:00:00.000Z"),
      };
      const staleActive = await add({
        name: "Gravado ativo",
        status: "active",
        planId: plan!.id,
        sub: covering,
        dues: [new Date("2026-09-10T15:00:00.000Z")],
      });
      const dueTodayId = await add({
        name: "Vence hoje",
        status: "delinquent",
        planId: plan!.id,
        sub: covering,
        dues: [dueToday],
      });
      const ended = await add({
        name: "Contrato encerrado",
        status: "active",
        planId: plan!.id,
        sub: {
          active: false,
          startsAt: new Date("2026-01-01T12:00:00.000Z"),
          endsAt: new Date("2026-06-01T12:00:00.000Z"),
        },
      });
      const twoDebts = await add({
        name: "Duas vencidas",
        status: "inactive",
        planId: plan!.id,
        sub: covering,
        dues: [
          new Date("2026-08-10T15:00:00.000Z"),
          new Date("2026-08-20T15:00:00.000Z"),
        ],
      });
      await add({
        name: "Pagina A",
        status: "inactive",
        planId: plan!.id,
        sub: covering,
        dues: [new Date("2026-08-01T15:00:00.000Z")],
      });
      await add({
        name: "Pagina B",
        status: "inactive",
        planId: plan!.id,
        sub: covering,
        dues: [new Date("2026-08-02T15:00:00.000Z")],
      });
      await add({
        name: "Pagina C",
        status: "inactive",
        planId: plan!.id,
        sub: covering,
        dues: [new Date("2026-08-03T15:00:00.000Z")],
      });
      await add({
        name: "Outra academia",
        status: "active",
        tenant: other.tenant.id,
        planId: otherPlan!.id,
        sub: covering,
        dues: [new Date("2026-08-01T15:00:00.000Z")],
      });
      return { staleActive, dueTodayId, ended, twoDebts };
    });

    const sameDayPage = await withTenantTransaction(tenantId, (tx) =>
      listStudentsPage(tx, tenantId, {
        status: "delinquent",
        limit: 2,
        offset: 0,
        now: sameDay,
      }),
    );
    const dueTodayRow = await withTenantTransaction(tenantId, (tx) =>
      listStudentsPage(tx, tenantId, {
        q: "Vence hoje",
        limit: 5,
        offset: 0,
        now: sameDay,
      }),
    );
    const nextDayRow = await withTenantTransaction(tenantId, (tx) =>
      listStudentsPage(tx, tenantId, {
        q: "Vence hoje",
        limit: 5,
        offset: 0,
        now: nextDay,
      }),
    );
    const endedRow = await withTenantTransaction(tenantId, (tx) =>
      listStudentsPage(tx, tenantId, {
        q: "Contrato encerrado",
        limit: 5,
        offset: 0,
        now: sameDay,
      }),
    );
    const secondPage = await withTenantTransaction(tenantId, (tx) =>
      listStudentsPage(tx, tenantId, {
        status: "delinquent",
        limit: 2,
        offset: 2,
        now: sameDay,
      }),
    );
    const stored = await withTenantTransaction(tenantId, async (tx) => {
      const rows = await tx
        .select({ id: students.id, status: students.status })
        .from(students)
        .where(eq(students.tenantId, tenantId));
      return new Map(rows.map((row) => [row.id, row.status]));
    });

    expect(sameDayPage.total).toBe(5);
    expect(sameDayPage.items).toHaveLength(2);
    expect(sameDayPage.items.every((row) => row.status === "delinquent")).toBe(true);
    expect(sameDayPage.items.some((row) => row.fullName === "Vence hoje")).toBe(false);
    expect(dueTodayRow.items[0]?.status).toBe("active");
    expect(nextDayRow.items[0]?.status).toBe("delinquent");
    expect(endedRow.items[0]?.status).toBe("inactive");
    expect(secondPage.total).toBe(5);
    expect(secondPage.items).toHaveLength(2);
    expect(stored.get(ids.staleActive)).toBe("active");
    expect(stored.get(ids.dueTodayId)).toBe("delinquent");
    expect(stored.get(ids.ended)).toBe("active");

    await withBypassRlsTransaction(async (tx) => {
      const open = await tx
        .select({ id: invoices.id })
        .from(invoices)
        .where(and(eq(invoices.studentId, ids.twoDebts), eq(invoices.status, "open")));
      await tx
        .update(invoices)
        .set({ status: "paid", paidAt: sameDay })
        .where(eq(invoices.id, open[0]!.id));
    });
    const stillLate = await withTenantTransaction(tenantId, (tx) =>
      listStudentsPage(tx, tenantId, {
        q: "Duas vencidas",
        limit: 5,
        offset: 0,
        now: sameDay,
      }),
    );
    expect(stillLate.items[0]?.status).toBe("delinquent");

    await withBypassRlsTransaction(async (tx) => {
      await tx
        .update(invoices)
        .set({ status: "paid", paidAt: sameDay })
        .where(and(eq(invoices.studentId, ids.twoDebts), eq(invoices.status, "open")));
    });
    const cleared = await withTenantTransaction(tenantId, async (tx) => {
      const page = await listStudentsPage(tx, tenantId, {
        q: "Duas vencidas",
        limit: 5,
        offset: 0,
        now: sameDay,
      });
      const totals = await countStudentsByEffectiveStatus(tx, tenantId, sameDay);
      return { page, totals };
    });
    expect(cleared.page.items[0]?.status).toBe("active");
    expect(cleared.totals.delinquent).toBe(4);
    expect(cleared.totals.active).toBe(2);
    expect(cleared.totals.inactive).toBe(1);
  });
});
