import { and, eq } from "drizzle-orm";
import { invoiceTimelineEvents, invoices } from "@/lib/db/schema";
import type { DbTransaction } from "@/lib/db/with-tenant";

/**
 * Correções administrativas de fatura. Não apagam histórico: a fatura muda de
 * estado e a linha do tempo registra quem, quando, por quê e o estado anterior.
 */

export type CorrectionResult =
  | { status: "done"; studentId: string }
  | { status: "not_found" }
  | { status: "invalid_state"; message: string; studentId: string };

export async function voidOpenInvoice(
  tx: DbTransaction,
  input: { tenantId: string; invoiceId: string; reason: string; actorUserId: string },
): Promise<CorrectionResult> {
  const [inv] = await tx
    .select({
      id: invoices.id,
      studentId: invoices.studentId,
      status: invoices.status,
      gatewayChargeStatus: invoices.gatewayChargeStatus,
    })
    .from(invoices)
    .where(and(eq(invoices.id, input.invoiceId), eq(invoices.tenantId, input.tenantId)))
    .for("update")
    .limit(1);
  if (!inv) return { status: "not_found" };

  if (inv.status === "paid") {
    return {
      status: "invalid_state",
      studentId: inv.studentId,
      message: "Fatura paga não pode ser cancelada. Estorne o pagamento primeiro.",
    };
  }
  if (inv.status === "void") {
    return { status: "invalid_state", studentId: inv.studentId, message: "Fatura já cancelada." };
  }
  if (inv.gatewayChargeStatus === "pending") {
    return {
      status: "invalid_state",
      studentId: inv.studentId,
      message:
        "Há cobrança aguardando confirmação na maquininha. Confira a transação antes de cancelar.",
    };
  }

  await tx
    .update(invoices)
    .set({ status: "void", nextChargeAttemptAt: null })
    .where(and(eq(invoices.id, inv.id), eq(invoices.tenantId, input.tenantId)));
  await tx.insert(invoiceTimelineEvents).values({
    tenantId: input.tenantId,
    invoiceId: inv.id,
    type: "note",
    payload: {
      kind: "invoice_voided",
      message: "Fatura cancelada.",
      reason: input.reason,
      previousStatus: inv.status,
      by: input.actorUserId,
    },
  });
  return { status: "done", studentId: inv.studentId };
}

/**
 * Desfaz um pagamento registrado no balcão (lançamento indevido ou devolvido).
 * A fatura volta a ficar em aberto; se nada mais é devido, cancele em seguida.
 * Pagamento confirmado pela Stone não é desfeito aqui: o dinheiro está no
 * provedor e o estorno precisa acontecer lá.
 */
export async function reverseManualPayment(
  tx: DbTransaction,
  input: { tenantId: string; invoiceId: string; reason: string; actorUserId: string },
): Promise<CorrectionResult> {
  const [inv] = await tx
    .select({
      id: invoices.id,
      studentId: invoices.studentId,
      status: invoices.status,
      paidAt: invoices.paidAt,
      settlementSource: invoices.settlementSource,
    })
    .from(invoices)
    .where(and(eq(invoices.id, input.invoiceId), eq(invoices.tenantId, input.tenantId)))
    .for("update")
    .limit(1);
  if (!inv) return { status: "not_found" };

  if (inv.status !== "paid") {
    return {
      status: "invalid_state",
      studentId: inv.studentId,
      message: "Só é possível estornar uma fatura paga.",
    };
  }
  if (inv.settlementSource !== "manual_reception") {
    return {
      status: "invalid_state",
      studentId: inv.studentId,
      message:
        "Pagamento confirmado pela Stone não é estornado pelo balcão. Faça o estorno na Stone e registre a conferência.",
    };
  }

  await tx
    .update(invoices)
    .set({ status: "open", paidAt: null, settlementSource: null })
    .where(and(eq(invoices.id, inv.id), eq(invoices.tenantId, input.tenantId)));
  await tx.insert(invoiceTimelineEvents).values({
    tenantId: input.tenantId,
    invoiceId: inv.id,
    type: "note",
    payload: {
      kind: "manual_payment_reversed",
      message: "Pagamento estornado. Fatura voltou a ficar em aberto.",
      reason: input.reason,
      previousPaidAt: inv.paidAt?.toISOString() ?? null,
      by: input.actorUserId,
    },
  });
  return { status: "done", studentId: inv.studentId };
}
