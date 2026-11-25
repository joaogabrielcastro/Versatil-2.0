import { randomUUID } from "crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AUTH_COOKIE_NAME } from "@/lib/auth/constants";
import { signSessionToken } from "@/lib/auth/jwt";
import { invoices, students } from "@/lib/db/schema";
import { withBypassRlsTransaction } from "@/lib/db/with-tenant";
import { createTenantWithAdmin } from "@/lib/services/onboarding/create-tenant";

const jar: { value?: string } = {};

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === AUTH_COOKIE_NAME && jar.value ? { value: jar.value } : undefined,
  }),
}));

process.env.CRON_SECRET ??= "stone-disabled-cron-secret";

describe("lançamento sem Stone (STONE_ENABLED desligado)", () => {
  const original = process.env.STONE_ENABLED;
  beforeEach(() => {
    delete process.env.STONE_ENABLED;
  });
  afterEach(() => {
    if (original === undefined) delete process.env.STONE_ENABLED;
    else process.env.STONE_ENABLED = original;
  });

  it("recusa cobrar na maquininha, ativar envio automático e salvar credenciais; cron fica em pausa", async () => {
    const suffix = randomUUID().slice(0, 8);
    const created = await createTenantWithAdmin({
      name: `SemStone ${suffix}`,
      slug: `semstone-${suffix}`,
      adminEmail: `semstone-${suffix}@example.com`,
      adminPassword: "senha-segura-12",
    });
    const tenantId = created.tenant.id;
    const { student, invoice } = await withBypassRlsTransaction(async (tx) => {
      const [student] = await tx
        .insert(students)
        .values({ tenantId, fullName: "Aluno", cpf: `s${suffix}` })
        .returning();
      const [invoice] = await tx
        .insert(invoices)
        .values({ tenantId, studentId: student!.id, amountCents: 9900, dueAt: new Date() })
        .returning();
      return { student: student!, invoice: invoice! };
    });
    jar.value = await signSessionToken(
      { sub: created.admin.id, typ: "tenant", tid: tenantId, role: "tenant_admin", sv: 1 },
      process.env.JWT_SECRET!,
    );

    const { POST: charge } = await import("@/app/api/billing/stone/charge/route");
    const chargeRes = await charge(
      new Request("http://test/api/billing/stone/charge", {
        method: "POST",
        body: JSON.stringify({ invoiceId: invoice.id }),
      }),
    );
    expect(chargeRes.status).toBe(409);

    const { PUT: autoRenew } = await import("@/app/api/students/[id]/auto-renew/route");
    const renewRes = await autoRenew(
      new Request(`http://test/api/students/${student.id}/auto-renew`, {
        method: "PUT",
        body: JSON.stringify({ autoRenew: true }),
      }),
      { params: Promise.resolve({ id: student.id }) },
    );
    expect(renewRes?.status).toBe(409);

    const { PUT: saveStone } = await import("@/app/api/tenant/payment-providers/stone/route");
    const saveRes = await saveStone(
      new Request("http://test/api/tenant/payment-providers/stone", {
        method: "PUT",
        body: JSON.stringify({ secretKey: "sk_test_x", serviceRefererName: "ref" }),
      }),
    );
    expect(saveRes?.status).toBe(409);

    const { GET: cron } = await import("@/app/api/cron/charge-open-invoices/route");
    const cronRes = await cron(
      new Request("http://test/api/cron/charge-open-invoices", {
        headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
      }),
    );
    expect(cronRes.status).toBe(200);
    expect(((await cronRes.json()) as { execution: string }).execution).toBe("skipped");

    // Pagamento no balcão continua normal.
    const { POST: settle } = await import("@/app/api/invoices/[id]/settle-manual/route");
    const settleRes = await settle(
      new Request(`http://test/api/invoices/${invoice.id}/settle-manual`, {
        method: "POST",
        body: JSON.stringify({ paymentMethod: "stone_card" }),
      }),
      { params: Promise.resolve({ id: invoice.id }) },
    );
    expect(settleRes.status).toBe(200);
  });
});
