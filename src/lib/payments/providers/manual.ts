import { and, eq } from "drizzle-orm";
import { invoiceTimelineEvents, invoices } from "@/lib/db/schema";
import type {
  PaymentProvider,
  SettleManualInput,
  SettleResult,
} from "@/lib/payments/provider";

/**
 * Provedor "manual" — pagamento recebido no balcão (dinheiro, Pix, cartão Stone
 * na maquininha) e registrado pela recepção. É o fluxo ativo do Plano C.
 *
 * `settleManual` executa apenas a mutação da fatura dentro da transação
 * recebida; recálculo de status do aluno e auditoria ficam a cargo do chamador
 * (para manter o comportamento atual do endpoint).
 */
export const manualProvider: PaymentProvider = {
  id: "manual",
  label: "Balcão (manual)",
  capabilities: ["manual_settlement"],

  async settleManual(input: SettleManualInput): Promise<SettleResult> {
    const { tx, tenantId, invoiceId, paymentMethod, note, actorUserId } = input;

    const [inv] = await tx
      .select({
        id: invoices.id,
        studentId: invoices.studentId,
        status: invoices.status,
      })
      .from(invoices)
      .where(and(eq(invoices.id, invoiceId), eq(invoices.tenantId, tenantId)))
      .limit(1);

    if (!inv) {
      return { status: "not_found", studentId: null };
    }

    if (inv.status === "paid" || inv.status === "void") {
      return { status: "already_settled", studentId: inv.studentId };
    }

    await tx
      .update(invoices)
      .set({
        status: "paid",
        paidAt: new Date(),
        settlementSource: "manual_reception",
      })
      .where(eq(invoices.id, invoiceId));

    await tx.insert(invoiceTimelineEvents).values({
      tenantId,
      invoiceId,
      type: "manual_payment",
      payload: {
        paymentMethod: paymentMethod ?? null,
        note: note ?? null,
        by: actorUserId ?? null,
      },
    });

    return { status: "settled", studentId: inv.studentId };
  },
};
