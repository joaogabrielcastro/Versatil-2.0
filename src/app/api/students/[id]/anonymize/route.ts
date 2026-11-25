import { NextResponse } from "next/server";
import { z } from "zod";
import { logAudit } from "@/lib/audit/log";
import { jsonError } from "@/lib/api/json";
import { isSessionError, requireTenantAdmin } from "@/lib/auth/guards";
import { withTenantTransaction } from "@/lib/db/with-tenant";
import {
  ANONYMIZE_CONFIRMATION,
  anonymizeStudent,
} from "@/lib/services/lgpd/student-privacy";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  confirm: z.literal(ANONYMIZE_CONFIRMATION, {
    error: `Digite ${ANONYMIZE_CONFIRMATION} para confirmar.`,
  }),
  reason: z.string().trim().min(5, "Informe o motivo (mínimo 5 caracteres).").max(500),
});

/**
 * LGPD art. 18, VI: eliminação a pedido do titular. Irreversível.
 * Remove dados pessoais e treinos; mantém faturas e presença sem identificação.
 */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await requireTenantAdmin();
  if (isSessionError(session)) return session;
  const tenantId = session.tid;
  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) {
    return jsonError(400, "ID inválido.");
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return jsonError(400, parsed.error.issues[0]?.message ?? "Payload inválido.");
  }

  const result = await withTenantTransaction(tenantId, (tx) =>
    anonymizeStudent(tx, { tenantId, studentId: id }),
  );
  if (result.status === "not_found") return jsonError(404, "Aluno não encontrado.");
  if (result.status === "blocked") return jsonError(409, result.message);

  // O motivo fica na auditoria; deve descrever o pedido, sem dados pessoais.
  await logAudit({
    tenantId,
    actorUserId: session.sub,
    action: "student.anonymized",
    entity: "student",
    entityId: id,
    payload: { reason: parsed.data.reason },
  });
  return NextResponse.json({ ok: true });
}
