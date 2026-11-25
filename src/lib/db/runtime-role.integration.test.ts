import { randomUUID } from "crypto";
import postgres from "postgres";
import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { students } from "@/lib/db/schema";
import { withBypassRlsTransaction } from "@/lib/db/with-tenant";
import { PlatformDatabaseNotConfigured } from "@/lib/db/with-tenant";

const RUNTIME_PASSWORD = "runtime-test-only";

/** GRANT/CREATE ROLE em paralelo com outro arquivo de teste pode dar "tuple concurrently updated". */
async function ddl(run: () => Promise<unknown>, attempts = 5): Promise<void> {
  for (let i = 1; ; i++) {
    try {
      await run();
      return;
    } catch (err) {
      const text = String((err as { cause?: unknown })?.cause ?? err);
      if (i >= attempts || !/concurrently updated|deadlock/i.test(text)) throw err;
      await new Promise((r) => setTimeout(r, 50 * i));
    }
  }
}

function runtimeUrl(): string {
  const url = new URL(process.env.DATABASE_URL!);
  url.username = "versatil_runtime";
  url.password = RUNTIME_PASSWORD;
  return url.toString();
}

describe("papel de runtime sem privilégio de plataforma", () => {
  it("não ativa bypass, não assume versatil_platform e não lê outra academia", async () => {
    const tenantA = randomUUID();
    const tenantB = randomUUID();
    const db = getDb();

    await ddl(() => db.execute(sql`
      DO $$ BEGIN
        CREATE ROLE versatil_runtime
          LOGIN PASSWORD 'runtime-test-only'
          NOSUPERUSER NOBYPASSRLS;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `));
    await ddl(() => db.execute(sql`GRANT versatil_app TO versatil_runtime`));
    // Nome do banco varia (local: versatil_test; CI: ci). Usa o banco atual.
    await ddl(() =>
      db.execute(sql`
        DO $$ BEGIN
          EXECUTE format('GRANT CONNECT ON DATABASE %I TO versatil_runtime', current_database());
        END $$
      `),
    );
    await ddl(() => db.execute(sql`GRANT USAGE ON SCHEMA public, app TO versatil_runtime`));
    await ddl(() => db.execute(sql`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO versatil_runtime`));
    await ddl(() => db.execute(sql`REVOKE ALL ON TABLE platform_admins, cron_runs FROM versatil_runtime`));
    await ddl(() => db.execute(sql`GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO versatil_runtime`));

    await withBypassRlsTransaction(async (tx) => {
      await tx.execute(sql`
        insert into tenants (id, name, slug)
        values (${tenantA}, 'Runtime A', ${`rt-a-${tenantA.slice(0, 8)}`}),
               (${tenantB}, 'Runtime B', ${`rt-b-${tenantB.slice(0, 8)}`})
      `);
      await tx.insert(students).values([
        { tenantId: tenantA, fullName: "Aluno A", cpf: `a${tenantA.slice(0, 10)}` },
        { tenantId: tenantB, fullName: "Aluno B", cpf: `b${tenantB.slice(0, 10)}` },
      ]);
    });

    const client = postgres(runtimeUrl(), { max: 1 });
    try {
      const bypass = await client<{ n: number }[]>`
        select set_config('app.bypass_rls', 'true', true),
               count(*)::int as n
        from students
      `;
      expect(Number(bypass[0]?.n)).toBe(0);

      await expect(
        client`set role versatil_platform`,
      ).rejects.toThrow();

      await client`select set_config('app.tenant_id', ${tenantA}, false)`;
      const visible = await client<{ name: string }[]>`
        select full_name as name from students
      `;
      expect(visible.map((row) => row.name)).toEqual(["Aluno A"]);
    } finally {
      await client.end();
      await withBypassRlsTransaction(async (tx) => {
        await tx.execute(sql`delete from tenants where id in (${tenantA}, ${tenantB})`);
      });
    }
  });

  it("recusa operação de plataforma sem PLATFORM_DATABASE_URL", () => {
    const err = new PlatformDatabaseNotConfigured();
    expect(err.message).toMatch(/PLATFORM_DATABASE_URL ausente/);
  });
});
