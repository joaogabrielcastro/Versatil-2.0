import { randomUUID } from "crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { signSessionToken, verifySessionToken } from "@/lib/auth/jwt";
import { revokeSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { tenantUsers } from "@/lib/db/schema";
import { withBypassRlsTransaction, withTenantTransaction } from "@/lib/db/with-tenant";
import { eq } from "drizzle-orm";
import { createTenantWithAdmin } from "@/lib/services/onboarding/create-tenant";

const secret = "01234567890123456789012345678901";

describe("revogação de sessão e bypass de RLS", () => {
  it("logout invalida o JWT já emitido e um token antigo sem sv não autentica", async () => {
    const suffix = randomUUID().slice(0, 8);
    const created = await createTenantWithAdmin({
      name: `Sessão ${suffix}`,
      slug: `sessao-${suffix}`,
      adminEmail: `sessao-${suffix}@example.com`,
      adminPassword: "senha-segura-12",
    });
    const token = await signSessionToken(
      {
        sub: created.admin.id,
        typ: "tenant",
        tid: created.tenant.id,
        role: "tenant_admin",
        sv: 1,
      },
      secret,
    );
    const parsed = await verifySessionToken(token, secret);
    await revokeSession(parsed);
    const version = await withTenantTransaction(created.tenant.id, async (tx) => {
      const [row] = await tx
        .select({ sv: tenantUsers.sessionVersion })
        .from(tenantUsers)
        .where(eq(tenantUsers.id, created.admin.id))
        .limit(1);
      return row?.sv;
    });
    expect(version).toBe(2);
    expect(parsed.sv).toBe(1);
    await expect(
      verifySessionToken(
        token.replace(token.split(".")[1]!, Buffer.from("{}").toString("base64url")),
        secret,
      ),
    ).rejects.toThrow();
  });

  it("papel sem versatil_platform não lê alunos nem platform_admins mesmo com bypass", async () => {
    await withBypassRlsTransaction(async (tx) => {
      await tx.execute(sql`
        DO $$ BEGIN
          CREATE ROLE versatil_probe NOLOGIN;
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$
      `);
      await tx.execute(sql`GRANT USAGE ON SCHEMA public TO versatil_probe`);
      await tx.execute(sql`GRANT USAGE ON SCHEMA app TO versatil_probe`);
      await tx.execute(sql`GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO versatil_probe`);
      await tx.execute(sql`GRANT SELECT ON students, platform_admins TO versatil_probe`);
    });

    const counts = await getDb().transaction(async (tx) => {
      await tx.execute(sql`set local role versatil_probe`);
      await tx.execute(sql`select set_config('app.bypass_rls', 'true', true)`);
      const studentsCount = await tx.execute(
        sql`select count(*)::int as n from students`,
      );
      const adminsCount = await tx.execute(
        sql`select count(*)::int as n from platform_admins`,
      );
      return { studentsCount, adminsCount };
    });

    const n = (result: unknown) => {
      const rows = Array.isArray(result)
        ? result
        : ((result as { rows?: Array<{ n: number }> }).rows ?? []);
      return Number(rows[0]?.n ?? -1);
    };
    expect(n(counts.studentsCount)).toBe(0);
    expect(n(counts.adminsCount)).toBe(0);
  });
});
