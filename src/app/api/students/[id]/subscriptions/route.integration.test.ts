import { randomUUID } from "crypto";
import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AUTH_COOKIE_NAME } from "@/lib/auth/constants";
import { signSessionToken } from "@/lib/auth/jwt";
import { invoices, plans, studentSubscriptions, students } from "@/lib/db/schema";
import { toIsoDateInTz } from "@/lib/dates/br";
import { withBypassRlsTransaction } from "@/lib/db/with-tenant";
import { createTenantWithAdmin } from "@/lib/services/onboarding/create-tenant";

const jar: { value?: string } = {};

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === AUTH_COOKIE_NAME && jar.value ? { value: jar.value } : undefined,
  }),
}));

async function setup() {
  const suffix = randomUUID().slice(0, 8);
  const created = await createTenantWithAdmin({
    name: `Matrícula ${suffix}`,
    slug: `matricula-${suffix}`,
    adminEmail: `matricula-${suffix}@example.com`,
    adminPassword: "senha-segura-12",
  });
  const tenantId = created.tenant.id;
  const rows = await withBypassRlsTransaction(async (tx) => {
    const [student] = await tx
      .insert(students)
      .values({ tenantId, fullName: "Aluno matrícula", cpf: `m${suffix}` })
      .returning();
    const [mensal, anual, lutas] = await tx
      .insert(plans)
      .values([
        { tenantId, name: "Academia mensal", category: "Academia", priceCents: 12900 },
        {
          tenantId,
          name: "Academia anual",
          category: "Academia",
          priceCents: 99000,
          billingInterval: "yearly",
        },
        { tenantId, name: "Muay Thai", category: "Lutas", priceCents: 15000 },
      ])
      .returning();
    return { student: student!, mensal: mensal!, anual: anual!, lutas: lutas! };
  });
  jar.value = await signSessionToken(
    { sub: created.admin.id, typ: "tenant", tid: tenantId, role: "tenant_admin", sv: 1 },
    process.env.JWT_SECRET!,
  );
  return { tenantId, ...rows };
}

async function subscribe(studentId: string, planId: string, startsAt: string) {
  const { POST } = await import("@/app/api/students/[id]/subscriptions/route");
  return POST(
    new Request(`http://test/api/students/${studentId}/subscriptions`, {
      method: "POST",
      body: JSON.stringify({ planId, startsAt }),
    }),
    { params: Promise.resolve({ id: studentId }) },
  );
}

async function countSubs(tenantId: string, studentId: string) {
  return withBypassRlsTransaction(async (tx) => {
    const subs = await tx
      .select({ id: studentSubscriptions.id })
      .from(studentSubscriptions)
      .where(
        and(
          eq(studentSubscriptions.tenantId, tenantId),
          eq(studentSubscriptions.studentId, studentId),
        ),
      );
    const invs = await tx
      .select({ id: invoices.id })
      .from(invoices)
      .where(and(eq(invoices.tenantId, tenantId), eq(invoices.studentId, studentId)));
    return { subs: subs.length, invoices: invs.length };
  });
}

describe("matrícula duplicada", () => {
  beforeEach(() => {
    jar.value = undefined;
  });

  it("recusa segunda matrícula vigente na mesma modalidade e não gera fatura", async () => {
    const t = await setup();
    const start = "2026-11-25T12:00:00.000Z";
    expect((await subscribe(t.student.id, t.mensal.id, start)).status).toBe(201);
    const again = await subscribe(t.student.id, t.mensal.id, start);
    expect(again.status).toBe(409);
    const otherPlanSameModality = await subscribe(t.student.id, t.anual.id, start);
    expect(otherPlanSameModality.status).toBe(409);
    expect(await countSubs(t.tenantId, t.student.id)).toEqual({ subs: 1, invoices: 1 });
  });

  it("permite modalidades diferentes ao mesmo tempo", async () => {
    const t = await setup();
    const start = "2026-11-25T12:00:00.000Z";
    expect((await subscribe(t.student.id, t.mensal.id, start)).status).toBe(201);
    expect((await subscribe(t.student.id, t.lutas.id, start)).status).toBe(201);
  });

  it("permite nova matrícula depois do fim da anterior", async () => {
    const t = await setup();
    await withBypassRlsTransaction(async (tx) => {
      await tx.insert(studentSubscriptions).values({
        tenantId: t.tenantId,
        studentId: t.student.id,
        planId: t.mensal.id,
        startsAt: new Date("2025-01-01T12:00:00.000Z"),
        endsAt: new Date("2025-12-31T12:00:00.000Z"),
        active: true,
        priceCents: 12900,
        billingInterval: "monthly",
      });
    });
    expect(
      (await subscribe(t.student.id, t.mensal.id, "2026-11-25T12:00:00.000Z")).status,
    ).toBe(201);
  });

  it("duas requisições simultâneas criam só uma matrícula", async () => {
    const t = await setup();
    const start = "2026-11-25T12:00:00.000Z";
    const results = await Promise.all([
      subscribe(t.student.id, t.mensal.id, start),
      subscribe(t.student.id, t.mensal.id, start),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect((await countSubs(t.tenantId, t.student.id)).subs).toBe(1);
  });

  it("início só com a data vence no mesmo dia em Brasília (não no dia anterior)", async () => {
    const t = await setup();
    expect((await subscribe(t.student.id, t.mensal.id, "2026-11-25")).status).toBe(201);
    const [inv] = await withBypassRlsTransaction((tx) =>
      tx
        .select({ dueAt: invoices.dueAt })
        .from(invoices)
        .where(and(eq(invoices.tenantId, t.tenantId), eq(invoices.studentId, t.student.id))),
    );
    expect(toIsoDateInTz(inv!.dueAt)).toBe("2026-11-25");
  });
});
