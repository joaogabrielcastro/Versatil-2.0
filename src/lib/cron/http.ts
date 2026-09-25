import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api/json";
import { recordCronRun } from "@/lib/cron/record";
import { PlatformDatabaseNotConfigured } from "@/lib/db/with-tenant";
import { getEnv } from "@/lib/env";

export function authorizeCron(request: Request): Response | null {
  const secret = getEnv().CRON_SECRET;
  if (!secret) {
    return jsonError(503, "CRON_SECRET não configurado no ambiente.");
  }
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return jsonError(401, "Não autorizado.");
  }
  return null;
}

export async function finishCron<
  T extends {
    failedTenantIds?: string[];
    chargeOutcome?: "success" | "partial" | "failed";
    succeeded?: number;
    failed?: number;
    skipped?: number;
  },
>(job: string, summary: T): Promise<Response> {
  const failedTenants = summary.failedTenantIds?.length ?? 0;
  const chargeProblem =
    summary.chargeOutcome === "partial" || summary.chargeOutcome === "failed";
  const ok = failedTenants === 0 && !chargeProblem;
  const error = chargeProblem
    ? `cobrança ${summary.chargeOutcome}: ${summary.succeeded ?? 0} sucesso(s), ${summary.failed ?? 0} falha(s), ${summary.skipped ?? 0} ignorado(s)`
    : failedTenants > 0
      ? `falha em ${failedTenants} academia(s)`
      : undefined;
  try {
    await recordCronRun({
      job,
      ok,
      summary: { ...summary, execution: "completed" },
      error,
    });
  } catch (err) {
    if (err instanceof PlatformDatabaseNotConfigured) {
      return jsonError(503, err.message);
    }
    throw err;
  }
  return NextResponse.json(
    { ok, execution: "completed", ...summary },
    { status: ok ? 200 : 500 },
  );
}

export function cronFailure(err: unknown): Response {
  if (err instanceof PlatformDatabaseNotConfigured) {
    return jsonError(503, err.message);
  }
  const message = err instanceof Error ? err.message : "Falha no cron.";
  return jsonError(500, message);
}
