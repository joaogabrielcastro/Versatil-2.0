import { randomUUID } from "crypto";
import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AUTH_COOKIE_NAME } from "@/lib/auth/constants";
import { signSessionToken } from "@/lib/auth/jwt";
import { hashPassword } from "@/lib/auth/password";
import {
  auditLogs,
  invoiceTimelineEvents,
  invoices,
  plans,
  studentSubscriptions,
  studentWorkouts,
  students,
  tenantUsers,
} from "@/lib/db/schema";
import { withBypassRlsTransaction } from "@/lib/db/with-tenant";
import { createTenantWithAdmin } from "@/lib/services/onboarding/create-tenant";

const jar: { value?: string } = {};

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === AUTH_COOKIE_NAME && jar.value ? { value: jar.value } : undefined,
  }),
}));

const secret = process.env.JWT_SECRET!;

async function setup() {
  const suffix = randomUUID().slice(0, 8);
  const created = await createTenantWithAdmin({
    name: `LGPD ${suffix}`,
    slug: `lgpd-${suffix}`,
    adminEmail: `lgpd-${suffix}@example.com`,
    adminPassword: "senha-segura-12",
  });
  const tenantId = created.tenant.id;
  const rows = await withBypassRlsTransaction(async (tx) => {
    const [student] = await tx
      .insert(students)
      .values({
        tenantId,
        fullName: "Maria Titular",
        cpf: "52998224725",
        email: "maria@example.com",
        whatsapp: "41999990000",
        birthDate: new Date("1990-05-10"),
      })
      .returning();
    const [plan] = await tx
      .insert(plans)
      .values({ tenantId, name: "Mensal", priceCents: 12900 })
      .returning();
    const [sub] = await tx
      .insert(studentSubscriptions)
      .values({
        tenantId,
        studentId: student!.id,
        planId: plan!.id,
        startsAt: new Date("2026-01-10T15:00:00.000Z"),
        endsAt: new Date("2026-06-10T15:00:00.000Z"),
        active: true,
        priceCents: 12900,
        billingInterval: "monthly",
      })
      .returning();
    const [paid] = await tx
      .insert(invoices)
      .values({
        tenantId,
        studentId: student!.id,
        amountCents: 12900,
        status: "paid",
        paidAt: new Date("2026-02-10T15:00:00.000Z"),
        settlementSource: "manual_reception",
        dueAt: new Date("2026-02-10T15:00:00.000Z"),
      })
      .returning();
    await tx.insert(invoiceTimelineEvents).values({
      tenantId,
      invoiceId: paid!.id,
      type: "manual_payment",
      payload: { paymentMethod: "pix", note: "Pix da Maria Titular" },
    });
    await tx.insert(studentWorkouts).values({
      tenantId,
      studentId: student!.id,
      name: "Treino A",
      exercises: [],
      notes: "Hérnia de disco",
    });
    await tx.insert(auditLogs).values({
      tenantId,
      action: "student.updated",
      entity: "student",
      entityId: student!.id,
      payload: { fullName: "Maria Titular", email: "maria@example.com" },
    });
    const [recep] = await tx
      .insert(tenantUsers)
      .values({
        tenantId,
        email: `recep-${suffix}@example.com`,
        passwordHash: await hashPassword("senha-segura-12"),
        role: "tenant_user",
      })
      .returning();
    return { student: student!, sub: sub!, paid: paid!, recep: recep! };
  });
  const admin = await signSessionToken(
    { sub: created.admin.id, typ: "tenant", tid: tenantId, role: "tenant_admin", sv: 1 },
    secret,
  );
  const recep = await signSessionToken(
    { sub: rows.recep.id, typ: "tenant", tid: tenantId, role: "tenant_user", sv: 1 },
    secret,
  );
  return { tenantId, admin, recep, student: rows.student, sub: rows.sub, paid: rows.paid };
}

async function exportData(token: string, id: string) {
  jar.value = token;
  const { GET } = await import("@/app/api/students/[id]/data-export/route");
  return GET(new Request(`http://test/api/students/${id}/data-export`), {
    params: Promise.resolve({ id }),
  });
}

async function anonymize(token: string, id: string, body: unknown) {
  jar.value = token;
  const { POST } = await import("@/app/api/students/[id]/anonymize/route");
  return POST(
    new Request(`http://test/api/students/${id}/anonymize`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );
}

describe("LGPD: direitos do titular", () => {
  beforeEach(() => {
    jar.value = undefined;
  });

  it("admin exporta os dados do aluno; recepção não", async () => {
    const t = await setup();
    expect((await exportData(t.recep, t.student.id)).status).toBe(403);
    const res = await exportData(t.admin, t.student.id);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toContain("attachment");
    const data = (await res.json()) as {
      student: { cpf: string; email: string };
      invoices: unknown[];
      subscriptions: unknown[];
      workouts: unknown[];
    };
    expect(data.student.cpf).toBe("52998224725");
    expect(data.student.email).toBe("maria@example.com");
    expect(data.invoices).toHaveLength(1);
    expect(data.subscriptions).toHaveLength(1);
    expect(data.workouts).toHaveLength(1);
  });

  it("anonimiza: remove dados pessoais e treinos, mantém o financeiro", async () => {
    const t = await setup();
    const ok = { confirm: "ANONIMIZAR", reason: "Pedido do titular por e-mail" };
    expect((await anonymize(t.recep, t.student.id, ok)).status).toBe(403);
    expect(
      (await anonymize(t.admin, t.student.id, { confirm: "sim", reason: "Pedido do titular" }))
        .status,
    ).toBe(400);
    expect((await anonymize(t.admin, t.student.id, ok)).status).toBe(200);

    const after = await withBypassRlsTransaction(async (tx) => {
      const [student] = await tx.select().from(students).where(eq(students.id, t.student.id));
      const invs = await tx
        .select()
        .from(invoices)
        .where(and(eq(invoices.tenantId, t.tenantId), eq(invoices.studentId, t.student.id)));
      const workouts = await tx
        .select()
        .from(studentWorkouts)
        .where(eq(studentWorkouts.studentId, t.student.id));
      const timeline = await tx
        .select({ payload: invoiceTimelineEvents.payload })
        .from(invoiceTimelineEvents)
        .where(eq(invoiceTimelineEvents.invoiceId, t.paid.id));
      const audit = await tx
        .select({ payload: auditLogs.payload })
        .from(auditLogs)
        .where(and(eq(auditLogs.tenantId, t.tenantId), eq(auditLogs.entityId, t.student.id)));
      return { student: student!, invs, workouts, timeline, audit };
    });

    const s = after.student;
    expect(s.fullName).toBe("Aluno anonimizado");
    expect(s.cpf).not.toBe("52998224725");
    expect(s.email).toBeNull();
    expect(s.whatsapp).toBeNull();
    expect(s.birthDate).toBeNull();
    expect(s.anonymizedAt).not.toBeNull();
    expect(after.workouts).toHaveLength(0);
    expect(after.invs).toHaveLength(1);
    expect(after.invs[0]!.status).toBe("paid");
    expect(after.invs[0]!.amountCents).toBe(12900);
    const everything = JSON.stringify([after.timeline, after.audit]);
    expect(everything).not.toContain("Maria");
    expect(everything).not.toContain("maria@example.com");
    // O registro da própria anonimização fica, com o motivo.
    expect(everything).toContain("Pedido do titular por e-mail");

    // Depois disso, os dados não voltam por edição nem por nova matrícula.
    jar.value = t.admin;
    const { PATCH } = await import("@/app/api/students/[id]/route");
    const patch = await PATCH(
      new Request(`http://test/api/students/${t.student.id}`, {
        method: "PATCH",
        body: JSON.stringify({ fullName: "Maria Titular" }),
      }),
      { params: Promise.resolve({ id: t.student.id }) },
    );
    expect(patch.status).toBe(409);
    expect((await anonymize(t.admin, t.student.id, ok)).status).toBe(409);
  });

  it("não anonimiza com matrícula vigente ou fatura em aberto", async () => {
    const t = await setup();
    const ok = { confirm: "ANONIMIZAR", reason: "Pedido do titular por e-mail" };

    await withBypassRlsTransaction((tx) =>
      tx
        .update(studentSubscriptions)
        .set({ endsAt: new Date(Date.now() + 30 * 86_400_000) })
        .where(eq(studentSubscriptions.id, t.sub.id)),
    );
    const withSub = await anonymize(t.admin, t.student.id, ok);
    expect(withSub.status).toBe(409);
    expect(((await withSub.json()) as { error: string }).error).toContain("matrícula vigente");

    await withBypassRlsTransaction(async (tx) => {
      await tx
        .update(studentSubscriptions)
        .set({ endsAt: new Date("2026-01-31T15:00:00.000Z") })
        .where(eq(studentSubscriptions.id, t.sub.id));
      await tx.insert(invoices).values({
        tenantId: t.tenantId,
        studentId: t.student.id,
        amountCents: 5000,
        status: "open",
        dueAt: new Date("2026-03-10T15:00:00.000Z"),
      });
    });
    const withOpen = await anonymize(t.admin, t.student.id, ok);
    expect(withOpen.status).toBe(409);
    expect(((await withOpen.json()) as { error: string }).error).toContain("fatura em aberto");

    const [student] = await withBypassRlsTransaction((tx) =>
      tx.select().from(students).where(eq(students.id, t.student.id)),
    );
    expect(student!.fullName).toBe("Maria Titular");
  });
});
