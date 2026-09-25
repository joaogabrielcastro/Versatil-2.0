import { authorizeCron, cronFailure, finishCron } from "@/lib/cron/http";
import { reconcilePendingStoneCharges } from "@/lib/services/billing/stone-reconcile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const denied = authorizeCron(request);
  if (denied) return denied;
  try {
    const result = await reconcilePendingStoneCharges();
    return finishCron("reconcile-stone", result);
  } catch (err) {
    return cronFailure(err);
  }
}
