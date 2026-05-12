import { getEnv } from "@/lib/env";
import { getDb } from "@/lib/db/client";
import { getRedis } from "@/lib/redis";
import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

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

  const ok = database && redis;
  return NextResponse.json(
    { ok, database, redis, ts: new Date().toISOString() },
    { status: ok ? 200 : 503 },
  );
}
