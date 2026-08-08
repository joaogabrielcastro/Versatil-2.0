import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api/json";
import { getEnv } from "@/lib/env";
import { chargeDueInvoicesAll } from "@/lib/services/billing/recurring-charge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = getEnv().CRON_SECRET;
  if (!secret) {
    return jsonError(503, "CRON_SECRET não configurado no ambiente.");
  }
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return jsonError(401, "Não autorizado.");
  }

  const result = await chargeDueInvoicesAll();
  return NextResponse.json({ ok: true, ...result });
}
