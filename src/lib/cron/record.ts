import { desc, eq } from "drizzle-orm";
import { cronRuns } from "@/lib/db/schema";
import { withBypassRlsTransaction } from "@/lib/db/with-tenant";
import { log } from "@/lib/observability/logger";

export async function eachTenant<T>(
  job: string,
  tenantIds: string[],
  fn: (tenantId: string) => Promise<T>,
): Promise<{ values: T[]; failedTenantIds: string[] }> {
  const values: T[] = [];
  const failedTenantIds: string[] = [];
  for (const tenantId of tenantIds) {
    try {
      values.push(await fn(tenantId));
    } catch (err) {
      failedTenantIds.push(tenantId);
      log.error("cron.tenant_failed", {
        job,
        tenantId,
        error: err instanceof Error ? err.message : "erro",
      });
    }
  }
  return { values, failedTenantIds };
}

export async function recordCronRun(input: {
  job: string;
  ok: boolean;
  summary: Record<string, unknown>;
  error?: string;
}): Promise<void> {
  await withBypassRlsTransaction(async (tx) => {
    await tx.insert(cronRuns).values({
      job: input.job,
      ok: input.ok,
      summary: input.summary,
      error: input.error?.slice(0, 500) ?? null,
    });
  });
}

export async function latestCronRuns(limit = 8) {
  return withBypassRlsTransaction(async (tx) => {
    return tx
      .select({
        job: cronRuns.job,
        ok: cronRuns.ok,
        finishedAt: cronRuns.finishedAt,
        error: cronRuns.error,
      })
      .from(cronRuns)
      .orderBy(desc(cronRuns.finishedAt))
      .limit(limit);
  });
}

export async function latestCronRun(job: string) {
  return withBypassRlsTransaction(async (tx) => {
    const [row] = await tx
      .select({
        ok: cronRuns.ok,
        finishedAt: cronRuns.finishedAt,
        error: cronRuns.error,
      })
      .from(cronRuns)
      .where(eq(cronRuns.job, job))
      .orderBy(desc(cronRuns.finishedAt))
      .limit(1);
    return row ?? null;
  });
}
