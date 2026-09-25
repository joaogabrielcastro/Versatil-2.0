import { sql } from "drizzle-orm";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import type { PostgresJsQueryResultHKT } from "drizzle-orm/postgres-js";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { getEnv } from "@/lib/env";
import { getDb } from "./client";
import * as schema from "./schema";

export class PlatformDatabaseNotConfigured extends Error {
  constructor() {
    super(
      "PLATFORM_DATABASE_URL ausente. Crons e operações de plataforma não usam o login da aplicação.",
    );
    this.name = "PlatformDatabaseNotConfigured";
  }
}

type Schema = typeof schema;
type DbClient = ReturnType<typeof getDb>;
type TFullSchema = ExtractTablesWithRelations<Schema>;

function platformDb() {
  const url = getEnv().PLATFORM_DATABASE_URL;
  if (!url) throw new PlatformDatabaseNotConfigured();
  const globalForPlatform = globalThis as unknown as { platformDb?: DbClient };
  if (!globalForPlatform.platformDb) {
    globalForPlatform.platformDb = drizzle(postgres(url, { max: 5 }), {
      schema,
    });
  }
  return globalForPlatform.platformDb;
}
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
  const db = platformDb();
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.bypass_rls', 'true', true)`);
    return fn(tx);
  });
}
