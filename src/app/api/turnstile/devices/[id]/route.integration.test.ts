import { randomUUID } from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AUTH_COOKIE_NAME } from "@/lib/auth/constants";
import { signSessionToken } from "@/lib/auth/jwt";
import { students } from "@/lib/db/schema";
import { withBypassRlsTransaction } from "@/lib/db/with-tenant";
import { createTenantWithAdmin } from "@/lib/services/onboarding/create-tenant";

const jar: { value?: string } = {};

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === AUTH_COOKIE_NAME && jar.value ? { value: jar.value } : undefined,
  }),
}));

async function access(token: string, studentId: string) {
  const { POST } = await import("@/app/api/turnstile/v1/access/route");
  return POST(
    new Request("http://test/api/turnstile/v1/access", {
      method: "POST",
      headers: { "x-tenant-device-token": token },
      body: JSON.stringify({ studentId }),
    }),
  );
}

async function patchDevice(id: string, action: string) {
  const { PATCH } = await import("@/app/api/turnstile/devices/[id]/route");
  return PATCH(
    new Request(`http://test/api/turnstile/devices/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ action }),
    }),
    { params: Promise.resolve({ id }) },
  );
}

describe("revogação de dispositivo de catraca", () => {
  beforeEach(() => {
    jar.value = undefined;
  });

  it("token revogado deixa de autenticar; token novo funciona e o antigo não", async () => {
    const suffix = randomUUID().slice(0, 8);
    const created = await createTenantWithAdmin({
      name: `Catraca ${suffix}`,
      slug: `catraca-${suffix}`,
      adminEmail: `catraca-${suffix}@example.com`,
      adminPassword: "senha-segura-12",
    });
    const tenantId = created.tenant.id;
    const [student] = await withBypassRlsTransaction((tx) =>
      tx.insert(students).values({ tenantId, fullName: "Aluno", cpf: `t${suffix}` }).returning(),
    );
    jar.value = await signSessionToken(
      { sub: created.admin.id, typ: "tenant", tid: tenantId, role: "tenant_admin", sv: 1 },
      process.env.JWT_SECRET!,
    );

    const { POST: createDevice } = await import("@/app/api/turnstile/devices/route");
    const res = await createDevice(
      new Request("http://test/api/turnstile/devices", {
        method: "POST",
        body: JSON.stringify({ name: "Entrada" }),
      }),
    );
    const { device, deviceToken } = (await res.json()) as {
      device: { id: string };
      deviceToken: string;
    };

    // Aluno sem plano: 403, mas o token é aceito (não 401).
    expect((await access(deviceToken, student!.id)).status).toBe(403);

    expect((await patchDevice(device.id, "revoke")).status).toBe(200);
    expect((await access(deviceToken, student!.id)).status).toBe(401);

    const rotated = await patchDevice(device.id, "rotate");
    const { deviceToken: fresh } = (await rotated.json()) as { deviceToken: string };
    expect(fresh).not.toBe(deviceToken);
    expect((await access(fresh, student!.id)).status).toBe(403);
    expect((await access(deviceToken, student!.id)).status).toBe(401);
  });
});
