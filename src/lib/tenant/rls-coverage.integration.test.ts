import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { getDb } from "@/lib/db/client";

/**
 * Toda tabela com tenant_id precisa de RLS ativo e forçado. Uma tabela nova
 * sem isso quebra este teste antes de chegar à produção.
 */
describe("cobertura de RLS", () => {
  it("todas as tabelas com tenant_id têm RLS habilitado e forçado", async () => {
    const result = await getDb().execute(sql`
      select c.relname as name, c.relrowsecurity as enabled, c.relforcerowsecurity as forced
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      join pg_attribute a on a.attrelid = c.oid and a.attname = 'tenant_id' and not a.attisdropped
      where n.nspname = 'public' and c.relkind = 'r'
      order by 1
    `);
    const rows = (Array.isArray(result) ? result : (result as { rows: unknown[] }).rows) as {
      name: string;
      enabled: boolean;
      forced: boolean;
    }[];
    expect(rows.length).toBeGreaterThan(20);
    const unprotected = rows.filter((r) => !r.enabled || !r.forced).map((r) => r.name);
    expect(unprotected).toEqual([]);
  });
});
