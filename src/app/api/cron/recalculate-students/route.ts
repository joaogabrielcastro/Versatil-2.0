import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api/json";
import { getEnv } from "@/lib/env";
import { recalculateAllStudents } from "@/lib/services/student-status";

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

  const { processed } = await recalculateAllStudents();
  return NextResponse.json({ ok: true, processed });
}
