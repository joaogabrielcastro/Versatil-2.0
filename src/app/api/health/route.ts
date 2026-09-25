import { getDb } from "@/lib/db/client";
import { latestCronRuns } from "@/lib/cron/record";
import { PlatformDatabaseNotConfigured } from "@/lib/db/with-tenant";
import { getEnv } from "@/lib/env";
import { getRedis } from "@/lib/redis";
import { readWorkerLiveness } from "@/lib/workers/heartbeat";
import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const STALE_MS = 36 * 60 * 60 * 1000;

export async function GET() {
  try {
    getEnv();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Ambiente inválido" },
      { status: 503 },
    );
  }

  let database = false;
  let redis = false;
  let platformDatabase = false;
  let crons: Array<{ job: string; ok: boolean; finishedAt: string; error: string | null; stale: boolean }> = [];

  try {
    await getDb().execute(sql`select 1`);
    database = true;
  } catch {
    database = false;
  }

  try {
    await getRedis().ping();
    redis = true;
  } catch {
    redis = false;
  }

  try {
    const rows = await latestCronRuns(12);
    platformDatabase = true;
    const now = Date.now();
    crons = rows.map((row) => ({
      job: row.job,
      ok: row.ok,
      finishedAt: row.finishedAt.toISOString(),
      error: row.error,
      stale: now - row.finishedAt.getTime() > STALE_MS,
    }));
  } catch (err) {
    platformDatabase = false;
    if (!(err instanceof PlatformDatabaseNotConfigured)) {
      crons = [];
    }
  }

  let worker: "active" | "absent" | "stale" = "absent";
  if (redis) {
    try {
      worker = await readWorkerLiveness(getRedis());
    } catch {
      worker = "absent";
    }
  }

  const cronFresh = crons.length > 0 && crons.every((row) => row.ok && !row.stale);
  const ok = database && redis && platformDatabase;
  return NextResponse.json(
    {
      ok,
      database,
      redis,
      platformDatabase,
      worker,
      processing: { worker, ok: worker === "active" },
      cronFresh,
      crons,
      ts: new Date().toISOString(),
    },
    { status: ok ? 200 : 503 },
  );
}
