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
  paymentMethod: z.enum(MANUAL_PAYMENT_METHODS, {
    errorMap: () => ({ message: "Informe a forma de pagamento (dinheiro, Pix ou cartão)." }),
  }),
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

  const parsed = settleSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return jsonError(400, parsed.error.issues[0]?.message ?? "Payload inválido.");
  }
  const body = parsed.data;

  const result = await withTenantTransaction(tenantId, async (tx) =>
    manualProvider.settleManual!({
      tx,
      tenantId,
      invoiceId,
      paymentMethod: body.paymentMethod,
      note: body.note ?? null,
      actorUserId: session.sub,
    }),
  );

  if (result.status === "not_found") {
    return jsonError(404, "Fatura não encontrada.");
  }

  if (result.status === "blocked_pending_pos") {
    return jsonError(
      409,
      "Aguardando confirmação da maquininha. Consulte a transação antes de registrar outro pagamento.",
    );
  }

  if (result.studentId && result.status === "settled") {
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
        paymentMethod: body.paymentMethod,
        note: body.note ?? null,
      },
    });
  }

  return NextResponse.json({
    ok: true,
    idempotent: result.status === "already_settled",
  });
}
