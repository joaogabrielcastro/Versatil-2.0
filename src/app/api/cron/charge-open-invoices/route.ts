import { authorizeCron, cronFailure, finishCron } from "@/lib/cron/http";
import { chargeDueInvoicesAll } from "@/lib/services/billing/recurring-charge";
import { isStoneEnabled } from "@/lib/payments/stone-feature";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const denied = authorizeCron(request);
  if (denied) return denied;
  if (!isStoneEnabled()) {
    // Desligado de propósito: não é falha, não gera alerta.
    return NextResponse.json({ ok: true, execution: "skipped", reason: "stone_disabled" });
  }
  try {
    const result = await chargeDueInvoicesAll();
    return finishCron("charge-open-invoices", result);
  } catch (err) {
    return cronFailure(err);
  }
}
