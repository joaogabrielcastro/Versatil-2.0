import { authorizeCron, cronFailure, finishCron } from "@/lib/cron/http";
import { chargeDueInvoicesAll } from "@/lib/services/billing/recurring-charge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const denied = authorizeCron(request);
  if (denied) return denied;
  try {
    const result = await chargeDueInvoicesAll();
    return finishCron("charge-open-invoices", result);
  } catch (err) {
    return cronFailure(err);
  }
}
