import "server-only";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { getEnv } from "@/lib/env";
import * as schema from "./schema";

export type DbClient = ReturnType<typeof drizzle<typeof schema>>;

const globalForDb = globalThis as unknown as {
  queryClient?: postgres.Sql;
  db?: DbClient;
};

function createClient() {
  const url = getEnv().DATABASE_URL;
  const client =
    globalForDb.queryClient ??
    postgres(url, {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
    });
  if (process.env.NODE_ENV !== "production") {
    globalForDb.queryClient = client;
  }
  return client;
}

export function getDb(): DbClient {
  if (!globalForDb.db) {
    globalForDb.db = drizzle(createClient(), { schema });
  }
  return globalForDb.db;
}
