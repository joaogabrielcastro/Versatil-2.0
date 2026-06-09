import { NextResponse } from "next/server";
import { logAudit } from "@/lib/audit/log";
import { jsonError } from "@/lib/api/json";
import { getSession } from "@/lib/auth/session";
import { generateSubscriptionInvoicesForTenant } from "@/lib/services/billing/subscription-invoice";

export const dynamic = "force-dynamic";

export async function POST() {
  const session = await getSession();
  if (!session || session.typ !== "tenant" || !session.tid) {
    return jsonError(401, "Não autenticado.");
  }
  if (session.role !== "tenant_admin") {
    return jsonError(403, "Apenas administrador da academia.");
  }

  const { created } = await generateSubscriptionInvoicesForTenant(session.tid);

  await logAudit({
    tenantId: session.tid,
    actorUserId: session.sub,
    action: "billing.invoices_generated",
    entity: "tenant",
    entityId: session.tid,
    payload: { created },
  });

  return NextResponse.json({ ok: true, created });
}
