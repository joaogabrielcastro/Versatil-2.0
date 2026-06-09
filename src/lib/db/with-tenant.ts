import { sql } from "drizzle-orm";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import type { PostgresJsQueryResultHKT } from "drizzle-orm/postgres-js";
import { getDb } from "./client";
import type * as schema from "./schema";

type Schema = typeof schema;
type TFullSchema = ExtractTablesWithRelations<Schema>;
export type DbTransaction = PgTransaction<
  PostgresJsQueryResultHKT,
  Schema,
  TFullSchema
>;

/** Contexto de tenant injetado na sessão PostgreSQL (RLS). */
export async function withTenantTransaction<T>(
  tenantId: string,
  fn: (tx: DbTransaction) => Promise<T>,
): Promise<T> {
  const db = getDb();
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.bypass_rls', 'false', true)`);
    await tx.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
    return fn(tx);
  });
}

/** Operações internas de plataforma (super admin) — usar apenas em código confiável. */
export async function withBypassRlsTransaction<T>(
  fn: (tx: DbTransaction) => Promise<T>,
): Promise<T> {
  const db = getDb();
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.bypass_rls', 'true', true)`);
    return fn(tx);
  });
}
