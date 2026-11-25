import { randomUUID } from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AUTH_COOKIE_NAME } from "@/lib/auth/constants";
import { signSessionToken } from "@/lib/auth/jwt";
import { hashPassword } from "@/lib/auth/password";
import { getSession } from "@/lib/auth/session";
import { tenantUsers } from "@/lib/db/schema";
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
    name: `Perfil ${suffix}`,
    slug: `perfil-${suffix}`,
    adminEmail: `perfil-${suffix}@example.com`,
    adminPassword: "senha-segura-12",
  });
  const tenantId = created.tenant.id;
  const [other] = await withBypassRlsTransaction(async (tx) =>
    tx
      .insert(tenantUsers)
      .values({
        tenantId,
        email: `gerente-${suffix}@example.com`,
        passwordHash: await hashPassword("senha-segura-12"),
        role: "tenant_admin",
      })
      .returning(),
  );
  const adminToken = await signSessionToken(
    { sub: created.admin.id, typ: "tenant", tid: tenantId, role: "tenant_admin", sv: 1 },
    secret,
  );
  const otherToken = await signSessionToken(
    { sub: other!.id, typ: "tenant", tid: tenantId, role: "tenant_admin", sv: 1 },
    secret,
  );
  return { tenantId, otherId: other!.id, adminToken, otherToken };
}

async function patch(token: string, id: string, body: unknown) {
  const { PATCH } = await import("@/app/api/tenant/users/[id]/route");
  jar.value = token;
  return PATCH(
    new Request(`http://test/api/tenant/users/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );
}

describe("mudança de perfil ou senha encerra sessões", () => {
  beforeEach(() => {
    jar.value = undefined;
  });

  it("admin rebaixado perde a sessão antiga e não continua como admin", async () => {
    const { otherId, adminToken, otherToken } = await setup();

    jar.value = otherToken;
    expect((await getSession())?.role).toBe("tenant_admin");

    const res = await patch(adminToken, otherId, { role: "tenant_user" });
    expect(res.status).toBe(200);

    jar.value = otherToken;
    expect(await getSession()).toBeNull();
  });

  it("senha redefinida invalida o token emitido antes", async () => {
    const { otherId, adminToken, otherToken } = await setup();
    const res = await patch(adminToken, otherId, { password: "nova-senha-123" });
    expect(res.status).toBe(200);
    jar.value = otherToken;
    expect(await getSession()).toBeNull();
  });

  it("o perfil vem do banco, não do token", async () => {
    const { tenantId, otherId } = await setup();
    const forgedRole = await signSessionToken(
      { sub: otherId, typ: "tenant", tid: tenantId, role: "tenant_admin", sv: 1 },
      secret,
    );
    await withBypassRlsTransaction(async (tx) => {
      const { eq } = await import("drizzle-orm");
      await tx
        .update(tenantUsers)
        .set({ role: "tenant_user" })
        .where(eq(tenantUsers.id, otherId));
    });
    jar.value = forgedRole;
    expect((await getSession())?.role).toBe("tenant_user");
  });
});
