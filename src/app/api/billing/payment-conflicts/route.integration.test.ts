import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AUTH_COOKIE_NAME } from "@/lib/auth/constants";
import { signSessionToken } from "@/lib/auth/jwt";
import { hashPassword } from "@/lib/auth/password";
import { invoices, paymentConflicts, students, tenantUsers } from "@/lib/db/schema";
import { withBypassRlsTransaction } from "@/lib/db/with-tenant";
import { createTenantWithAdmin } from "@/lib/services/onboarding/create-tenant";
import { processWebhookJob } from "@/workers/processors/webhook-job";

const jar: { value?: string } = {};

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === AUTH_COOKIE_NAME && jar.value ? { value: jar.value } : undefined,
  }),
}));

describe("conciliação visível ao administrador", () => {
  beforeEach(() => {
    jar.value = undefined;
  });

  it("pagamento após anulação aparece para o admin e a recepção só vê que há conferência", async () => {
    const { GET } = await import("@/app/api/billing/payment-conflicts/route");
    const suffix = randomUUID().slice(0, 8);
    const created = await createTenantWithAdmin({
      name: `Conf ${suffix}`,
      slug: `conf-${suffix}`,
      adminEmail: `conf-${suffix}@example.com`,
      adminPassword: "senha-segura-12",
    });
    const tenantId = created.tenant.id;
    const chargeId = `ch_${suffix}`;
    const invoiceId = await withBypassRlsTransaction(async (tx) => {
      const [student] = await tx
        .insert(students)
        .values({ tenantId, fullName: "Aluno conflito", cpf: `c${suffix}` })
        .returning();
      const [invoice] = await tx
        .insert(invoices)
        .values({
          tenantId,
          studentId: student!.id,
          amountCents: 8000,
          currency: "BRL",
          status: "void",
          dueAt: new Date("2026-03-15T15:00:00.000Z"),
          externalId: chargeId,
          idempotencyKey: `void:${suffix}`,
        })
        .returning();
      return invoice!.id;
    });

    await processWebhookJob({
      tenantId,
      provider: "stone",
      eventId: `evt_${suffix}`,
      type: "invoice.paid",
      invoiceId,
      chargeId,
      amountCents: 8000,
      currency: "BRL",
    });
    await processWebhookJob({
      tenantId,
      provider: "stone",
      eventId: `evt_${suffix}_dup`,
      type: "invoice.paid",
      invoiceId,
      chargeId,
      amountCents: 8000,
      currency: "BRL",
    });

    const secret = process.env.JWT_SECRET!;
    jar.value = await signSessionToken(
      { sub: created.admin.id, typ: "tenant", tid: tenantId, role: "tenant_admin", sv: 1 },
      secret,
    );
    const adminRes = await GET();
    expect(adminRes.status).toBe(200);
    const body = (await adminRes.json()) as {
      items: Array<{ invoiceId: string; chargeId: string; amountCents: number; reason: string }>;
    };
    expect(body.items).toHaveLength(1);
    expect(body.items[0]?.invoiceId).toBe(invoiceId);
    expect(body.items[0]?.chargeId).toBe(chargeId);
    expect(body.items[0]?.amountCents).toBe(8000);
    expect(body.items[0]?.reason).toMatch(/anulada/);

    const staff = await withBypassRlsTransaction(async (tx) => {
      const [row] = await tx
        .insert(tenantUsers)
        .values({
          tenantId,
          email: `func-conf-${suffix}@example.com`,
          passwordHash: await hashPassword("senha-segura-12"),
          role: "tenant_user",
        })
        .returning();
      return row!;
    });
    jar.value = await signSessionToken(
      { sub: staff.id, typ: "tenant", tid: tenantId, role: "tenant_user", sv: 1 },
      secret,
    );
    const staffRes = await GET();
    expect(staffRes.status).toBe(200);
    const staffBody = (await staffRes.json()) as {
      reviewRequired?: boolean;
      items?: unknown;
    };
    expect(staffBody.reviewRequired).toBe(true);
    expect(staffBody.items).toBeUndefined();

    const rows = await withBypassRlsTransaction(async (tx) => {
      return tx
        .select({ id: paymentConflicts.id })
        .from(paymentConflicts)
        .where(eq(paymentConflicts.invoiceId, invoiceId));
    });
    expect(rows).toHaveLength(1);
  });
});
