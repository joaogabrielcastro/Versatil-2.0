import { NextResponse } from "next/server";
import { z } from "zod";
import { logAudit } from "@/lib/audit/log";
import { jsonError } from "@/lib/api/json";
import { isSessionError, requireTenantAdmin } from "@/lib/auth/guards";
import { withTenantTransaction } from "@/lib/db/with-tenant";
import { voidOpenInvoice } from "@/lib/services/billing/invoice-corrections";
import { recalculateStudentStatus } from "@/lib/services/student-status";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  reason: z.string().trim().min(5, "Informe o motivo (mínimo 5 caracteres).").max(500),
});

/** Correção administrativa: exige perfil admin e motivo; fica na linha do tempo e na auditoria. */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await requireTenantAdmin();
  if (isSessionError(session)) return session;
  const tenantId = session.tid;

  const { id: invoiceId } = await ctx.params;
  if (!z.string().uuid().safeParse(invoiceId).success) {
    return jsonError(400, "ID de fatura inválido.");
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return jsonError(400, parsed.error.issues[0]?.message ?? "Payload inválido.");
  }
  const { reason } = parsed.data;

  const result = await withTenantTransaction(tenantId, (tx) =>
    voidOpenInvoice(tx, { tenantId, invoiceId, reason, actorUserId: session.sub }),
  );
  if (result.status === "not_found") {
    return jsonError(404, "Fatura não encontrada.");
  }
  if (result.status === "invalid_state") {
    return jsonError(409, result.message);
  }

  await recalculateStudentStatus(tenantId, result.studentId);
  await logAudit({
    tenantId,
    actorUserId: session.sub,
    action: "invoice.voided",
    entity: "invoice",
    entityId: invoiceId,
    payload: { reason },
  });
  return NextResponse.json({ ok: true });
}
