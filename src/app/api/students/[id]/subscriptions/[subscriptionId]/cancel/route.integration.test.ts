import { randomUUID } from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { signSessionToken } from "@/lib/auth/jwt";
import { AUTH_COOKIE_NAME } from "@/lib/auth/constants";
import { tenantUsers } from "@/lib/db/schema";
import { withBypassRlsTransaction } from "@/lib/db/with-tenant";
import { hashPassword } from "@/lib/auth/password";
import { createTenantWithAdmin } from "@/lib/services/onboarding/create-tenant";

const jar: { value?: string } = {};

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === AUTH_COOKIE_NAME && jar.value ? { value: jar.value } : undefined,
  }),
}));

describe("permissão das rotas de assinatura", () => {
  beforeEach(() => {
    jar.value = undefined;
  });

  it("funcionário recebe 403 e outra academia não altera a assinatura", async () => {
    const { POST } = await import(
      "@/app/api/students/[id]/subscriptions/[subscriptionId]/cancel/route"
    );
    const suffix = randomUUID().slice(0, 8);
    const created = await createTenantWithAdmin({
      name: `Perm ${suffix}`,
      slug: `perm-${suffix}`,
      adminEmail: `perm-${suffix}@example.com`,
      adminPassword: "senha-segura-12",
    });
    const staff = await withBypassRlsTransaction(async (tx) => {
      const [row] = await tx
        .insert(tenantUsers)
        .values({
          tenantId: created.tenant.id,
          email: `func-${suffix}@example.com`,
          passwordHash: await hashPassword("senha-segura-12"),
          role: "tenant_user",
        })
        .returning();
      return row!;
    });
    const secret = process.env.JWT_SECRET!;
    jar.value = await signSessionToken(
      {
        sub: staff.id,
        typ: "tenant",
        tid: created.tenant.id,
        role: "tenant_user",
        sv: 1,
      },
      secret,
    );
    const res = await POST(
      new Request("http://local/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "teste de permissão" }),
      }),
      { params: Promise.resolve({ id: randomUUID(), subscriptionId: randomUUID() }) },
    );
    expect(res.status).toBe(403);

    const other = await createTenantWithAdmin({
      name: `Outra ${suffix}`,
      slug: `outra-perm-${suffix}`,
      adminEmail: `outra-perm-${suffix}@example.com`,
      adminPassword: "senha-segura-12",
    });
    jar.value = await signSessionToken(
      {
        sub: other.admin.id,
        typ: "tenant",
        tid: other.tenant.id,
        role: "tenant_admin",
        sv: 1,
      },
      secret,
    );
    const cross = await POST(
      new Request("http://local/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "troca de id" }),
      }),
      {
        params: Promise.resolve({
          id: created.admin.id,
          subscriptionId: randomUUID(),
        }),
      },
    );
    expect(cross.status).toBe(404);
  });
});
