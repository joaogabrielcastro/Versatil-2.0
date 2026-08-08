import { NextResponse } from "next/server";
import { z } from "zod";
import { logAudit } from "@/lib/audit/log";
import { jsonError } from "@/lib/api/json";
import { getSession } from "@/lib/auth/session";
import { withTenantTransaction } from "@/lib/db/with-tenant";
import { MANUAL_PAYMENT_METHODS } from "@/lib/billing/payment-methods";
import { manualProvider } from "@/lib/payments/providers/manual";
import { recalculateStudentStatus } from "@/lib/services/student-status";

export const dynamic = "force-dynamic";

const settleSchema = z.object({
  paymentMethod: z.enum(MANUAL_PAYMENT_METHODS).optional(),
  note: z.string().max(500).optional(),
});

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session || session.typ !== "tenant" || !session.tid) {
    return jsonError(401, "Não autenticado como equipe da academia.");
  }
  const tenantId = session.tid;

  const { id: invoiceId } = await ctx.params;
  if (!z.string().uuid().safeParse(invoiceId).success) {
    return jsonError(400, "ID de fatura inválido.");
  }

  let body: z.infer<typeof settleSchema>;
  try {
    body = settleSchema.parse(await request.json().catch(() => ({})));
  } catch {
    return jsonError(400, "Payload inválido.");
  }

  const result = await withTenantTransaction(tenantId, async (tx) =>
    manualProvider.settleManual!({
      tx,
      tenantId,
      invoiceId,
      paymentMethod: body.paymentMethod ?? null,
      note: body.note ?? null,
      actorUserId: session.sub,
    }),
  );

  if (result.status === "not_found") {
    return jsonError(404, "Fatura não encontrada.");
  }

  if (result.studentId) {
    await recalculateStudentStatus(tenantId, result.studentId);
  }

  if (result.status === "settled") {
    await logAudit({
      tenantId,
      actorUserId: session.sub,
      action: "invoice.settled_manual",
      entity: "invoice",
      entityId: invoiceId,
      payload: {
        paymentMethod: body.paymentMethod ?? null,
        note: body.note ?? null,
      },
    });
  }

  return NextResponse.json({
    ok: true,
    idempotent: result.status === "already_settled",
  });
}
