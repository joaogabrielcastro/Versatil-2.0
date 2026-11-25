import { randomUUID } from "crypto";
import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AUTH_COOKIE_NAME } from "@/lib/auth/constants";
import { signSessionToken } from "@/lib/auth/jwt";
import { hashPassword } from "@/lib/auth/password";
import {
  invoiceTimelineEvents,
  invoices,
  plans,
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
    name: `Correção ${suffix}`,
    slug: `correcao-${suffix}`,
    adminEmail: `correcao-${suffix}@example.com`,
    adminPassword: "senha-segura-12",
  });
  const tenantId = created.tenant.id;
  const rows = await withBypassRlsTransaction(async (tx) => {
    const [student] = await tx
      .insert(students)
      .values({ tenantId, fullName: "Aluno correção", cpf: `k${suffix}` })
      .returning();
    const [recep] = await tx
      .insert(tenantUsers)
      .values({
        tenantId,
        email: `recep-${suffix}@example.com`,
        passwordHash: await hashPassword("senha-segura-12"),
        role: "tenant_user",
      })
      .returning();
    const [fee] = await tx
      .insert(plans)
      .values({
        tenantId,
        name: "Avaliação física",
        kind: "fee",
        accessEffect: "none",
        priceCents: 5000,
      })
      .returning();
    const [open] = await tx
      .insert(invoices)
      .values({
        tenantId,
        studentId: student!.id,
        amountCents: 12900,
        dueAt: new Date("2026-12-10T15:00:00.000Z"),
        purpose: "subscription",
      })
      .returning();
    return { student: student!, recep: recep!, fee: fee!, open: open! };
  });
  const admin = await signSessionToken(
    { sub: created.admin.id, typ: "tenant", tid: tenantId, role: "tenant_admin", sv: 1 },
    secret,
  );
  const recep = await signSessionToken(
    { sub: rows.recep.id, typ: "tenant", tid: tenantId, role: "tenant_user", sv: 1 },
    secret,
  );
  return { tenantId, admin, recep, student: rows.student, fee: rows.fee, open: rows.open };
}

function req(path: string, body: unknown) {
  return new Request(`http://test${path}`, { method: "POST", body: JSON.stringify(body) });
}

async function call(
  token: string,
  action: "settle-manual" | "void" | "reverse-payment",
  invoiceId: string,
  body: unknown,
) {
  jar.value = token;
  const mod =
    action === "settle-manual"
      ? await import("@/app/api/invoices/[id]/settle-manual/route")
      : action === "void"
        ? await import("@/app/api/invoices/[id]/void/route")
        : await import("@/app/api/invoices/[id]/reverse-payment/route");
  return mod.POST(req(`/api/invoices/${invoiceId}/${action}`, body), {
    params: Promise.resolve({ id: invoiceId }),
  });
}

async function invoiceRow(tenantId: string, id: string) {
  return withBypassRlsTransaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(invoices)
      .where(and(eq(invoices.id, id), eq(invoices.tenantId, tenantId)));
    return row!;
  });
}

describe("correção de faturas", () => {
  beforeEach(() => {
    jar.value = undefined;
  });

  it("quitação manual exige forma de pagamento", async () => {
    const t = await setup();
    const res = await call(t.recep, "settle-manual", t.open.id, {});
    expect(res.status).toBe(400);
    expect((await invoiceRow(t.tenantId, t.open.id)).status).toBe("open");
  });

  it("admin estorna pagamento manual com motivo; fatura volta a aberta e fica registrado", async () => {
    const t = await setup();
    expect((await call(t.recep, "settle-manual", t.open.id, { paymentMethod: "pix" })).status).toBe(200);

    expect((await call(t.recep, "reverse-payment", t.open.id, { reason: "pix não caiu" })).status).toBe(403);
    expect((await call(t.admin, "reverse-payment", t.open.id, { reason: "x" })).status).toBe(400);
    expect((await call(t.admin, "reverse-payment", t.open.id, { reason: "Pix não caiu na conta" })).status).toBe(200);

    const row = await invoiceRow(t.tenantId, t.open.id);
    expect(row.status).toBe("open");
    expect(row.paidAt).toBeNull();
    expect(row.settlementSource).toBeNull();

    const timeline = await withBypassRlsTransaction((tx) =>
      tx
        .select({ payload: invoiceTimelineEvents.payload })
        .from(invoiceTimelineEvents)
        .where(eq(invoiceTimelineEvents.invoiceId, t.open.id)),
    );
    expect(
      timeline.some(
        (e) => (e.payload as { kind?: string; reason?: string })?.reason === "Pix não caiu na conta",
      ),
    ).toBe(true);
  });

  it("pagamento confirmado pela Stone não é estornado pelo balcão", async () => {
    const t = await setup();
    await withBypassRlsTransaction((tx) =>
      tx
        .update(invoices)
        .set({ status: "paid", paidAt: new Date(), settlementSource: "automatic_gateway" })
        .where(eq(invoices.id, t.open.id)),
    );
    expect(
      (await call(t.admin, "reverse-payment", t.open.id, { reason: "teste de estorno" })).status,
    ).toBe(409);
    expect((await invoiceRow(t.tenantId, t.open.id)).status).toBe("paid");
  });

  it("admin cancela fatura aberta; paga ou com POS pendente não cancela", async () => {
    const t = await setup();
    expect((await call(t.recep, "void", t.open.id, { reason: "lançada em duplicidade" })).status).toBe(403);

    await withBypassRlsTransaction((tx) =>
      tx.update(invoices).set({ gatewayChargeStatus: "pending" }).where(eq(invoices.id, t.open.id)),
    );
    expect((await call(t.admin, "void", t.open.id, { reason: "lançada em duplicidade" })).status).toBe(409);

    await withBypassRlsTransaction((tx) =>
      tx.update(invoices).set({ gatewayChargeStatus: "idle" }).where(eq(invoices.id, t.open.id)),
    );
    expect((await call(t.admin, "void", t.open.id, { reason: "lançada em duplicidade" })).status).toBe(200);
    expect((await invoiceRow(t.tenantId, t.open.id)).status).toBe("void");
    expect((await call(t.admin, "void", t.open.id, { reason: "de novo, por engano" })).status).toBe(409);
  });

  it("recepção não cria fatura de valor livre, mas lança taxa pelo valor da tabela", async () => {
    const t = await setup();
    const { POST } = await import("@/app/api/invoices/route");
    jar.value = t.recep;
    const free = await POST(
      req("/api/invoices", {
        studentId: t.student.id,
        amountCents: 999999,
        dueAt: "2026-12-01T15:00:00.000Z",
        purpose: "manual",
      }),
    );
    expect(free.status).toBe(403);
    const cheaper = await POST(
      req("/api/invoices", {
        studentId: t.student.id,
        amountCents: 100,
        dueAt: "2026-12-01T15:00:00.000Z",
        purpose: "fee",
        planId: t.fee.id,
      }),
    );
    expect(cheaper.status).toBe(403);
    const fee = await POST(
      req("/api/invoices", {
        studentId: t.student.id,
        amountCents: 5000,
        dueAt: "2026-12-01T15:00:00.000Z",
        purpose: "fee",
        planId: t.fee.id,
      }),
    );
    expect(fee.status).toBe(201);

    jar.value = t.admin;
    const adminFree = await POST(
      req("/api/invoices", {
        studentId: t.student.id,
        amountCents: 4500,
        dueAt: "2026-12-01T15:00:00.000Z",
        purpose: "manual",
      }),
    );
    expect(adminFree.status).toBe(201);
  });
});
