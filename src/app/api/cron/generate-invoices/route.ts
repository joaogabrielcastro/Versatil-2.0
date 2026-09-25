import { authorizeCron, cronFailure, finishCron } from "@/lib/cron/http";
import { generateSubscriptionInvoicesAll } from "@/lib/services/billing/subscription-invoice";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const denied = authorizeCron(request);
  if (denied) return denied;
  try {
    const result = await generateSubscriptionInvoicesAll();
    return finishCron("generate-invoices", result);
  } catch (err) {
    return cronFailure(err);
  }
}
