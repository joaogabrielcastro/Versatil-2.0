import { logAudit } from "@/lib/audit/log";
import { and, eq } from "drizzle-orm";
import {
  invoiceTimelineEvents,
  invoices,
  paymentConflicts,
} from "@/lib/db/schema";
import { withTenantTransaction } from "@/lib/db/with-tenant";
import {
  assertFailureChargeMatchesInvoice,
  assertPaidWebhookMatchesInvoice,
  WebhookSettlementRejected,
} from "@/lib/payments/paid-webhook-match";
import { nextStateAfterPaymentFailed } from "@/lib/payments/recurring";
import { recalculateStudentStatus } from "@/lib/services/student-status";
import type { WebhookJobPayload } from "@/lib/queues/job-payloads";
import {
  markWebhookFailed,
  markWebhookProcessed,
  markWebhookProcessing,
  markWebhookRejected,
} from "@/lib/webhooks/ingest";

export async function processWebhookJob(data: WebhookJobPayload): Promise<void> {
  const { tenantId, provider, eventId } = data;

  await markWebhookProcessing(tenantId, provider, eventId);
  try {
    await applyWebhookEvent(data);
    await markWebhookProcessed(tenantId, provider, eventId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (err instanceof WebhookSettlementRejected) {
      await markWebhookRejected(tenantId, provider, eventId, message);
      return;
    }
    await markWebhookFailed(tenantId, provider, eventId, message);
    throw err;
  }
}

async function applyWebhookEvent(data: WebhookJobPayload): Promise<void> {
  const { tenantId, type, invoiceId, provider, eventId } = data;

  if (type === "invoice.paid") {
    if (!invoiceId) {
      throw new WebhookSettlementRejected("Evento pago sem fatura.");
    }
    let studentId: string | null = null;
    let markedPaid = false;
    await withTenantTransaction(tenantId, async (tx) => {
      const [inv] = await tx
        .select({
          id: invoices.id,
          studentId: invoices.studentId,
          status: invoices.status,
          amountCents: invoices.amountCents,
          currency: invoices.currency,
          externalId: invoices.externalId,
        })
        .from(invoices)
        .where(and(eq(invoices.id, invoiceId), eq(invoices.tenantId, tenantId)))
        .for("update")
        .limit(1);
      if (!inv) {
        throw new WebhookSettlementRejected("Fatura não encontrada neste tenant.");
      }
      const match = assertPaidWebhookMatchesInvoice(
        {
          chargeId: data.chargeId,
          amountCents: data.amountCents,
          currency: data.currency,
        },
        inv,
      );
      if (!match.ok) {
        throw new WebhookSettlementRejected(match.reason);
      }
      studentId = inv.studentId;
      if (inv.status === "paid") {
        return;
      }
      if (inv.status === "void") {
        await tx
          .update(invoices)
          .set({
            lastChargeError:
              "Pagamento confirmado após anulação. Fatura permanece anulada. Conciliação manual.",
          })
          .where(and(eq(invoices.id, invoiceId), eq(invoices.tenantId, tenantId)));
        await tx.insert(invoiceTimelineEvents).values({
          tenantId,
          invoiceId,
          type: "note",
          payload: {
            message:
              "Pagamento confirmado depois da anulação. Fatura permanece anulada e a assinatura não foi reativada. Conciliação manual.",
            chargeId: data.chargeId ?? null,
            amountCents: data.amountCents ?? null,
            currency: data.currency ?? null,
          },
        });
        await tx
          .insert(paymentConflicts)
          .values({
            tenantId,
            invoiceId,
            chargeId: data.chargeId ?? "sem-cobranca",
            eventId,
            amountCents: data.amountCents ?? inv.amountCents,
            currency: (data.currency ?? inv.currency).toUpperCase(),
            reason:
              "Pagamento confirmado após anulação. Fatura permanece anulada. Assinatura não reativada.",
          })
          .onConflictDoNothing({
            target: [
              paymentConflicts.tenantId,
              paymentConflicts.invoiceId,
              paymentConflicts.chargeId,
            ],
          });
        return;
      }
      await tx
        .update(invoices)
        .set({
          status: "paid",
          paidAt: new Date(),
          settlementSource: "automatic_gateway",
          gatewayChargeStatus: "succeeded",
          lastChargeError: null,
          nextChargeAttemptAt: null,
        })
        .where(and(eq(invoices.id, invoiceId), eq(invoices.tenantId, tenantId)));

      await tx.insert(invoiceTimelineEvents).values({
        tenantId,
        invoiceId,
        type: "webhook_received",
        payload: {
          provider,
          eventId,
          type,
          chargeId: data.chargeId,
          amountCents: data.amountCents,
          currency: data.currency,
        },
      });
      markedPaid = true;
    });
    if (studentId && markedPaid) {
      await recalculateStudentStatus(tenantId, studentId);
    }
    if (markedPaid) {
      await logAudit({
        tenantId,
        actorUserId: null,
        action: "invoice.paid_webhook",
        entity: "invoice",
        entityId: invoiceId,
        payload: { provider, eventId },
      });
    }
    return;
  }

  if (type === "invoice.payment_failed" && invoiceId) {
    let studentId: string | null = null;
    let markedFailed = false;
    let becameUncollectible = false;
    await withTenantTransaction(tenantId, async (tx) => {
      const [inv] = await tx
        .select({
          id: invoices.id,
          studentId: invoices.studentId,
          status: invoices.status,
          chargeAttempts: invoices.chargeAttempts,
          externalId: invoices.externalId,
        })
        .from(invoices)
        .where(and(eq(invoices.id, invoiceId), eq(invoices.tenantId, tenantId)))
        .for("update")
        .limit(1);
      if (!inv) {
        throw new WebhookSettlementRejected("Fatura não encontrada neste tenant.");
      }
      const charge = assertFailureChargeMatchesInvoice(data.chargeId, inv);
      if (!charge.ok) {
        throw new WebhookSettlementRejected(charge.reason);
      }
      const next = nextStateAfterPaymentFailed({
        invoiceStatus: inv.status,
        chargeAttempts: inv.chargeAttempts,
      });
      if (next.skip) {
        return;
      }
      studentId = inv.studentId;
      becameUncollectible = next.invoiceStatus === "uncollectible";
      await tx
        .update(invoices)
        .set({
          status: next.invoiceStatus,
          gatewayChargeStatus: next.gatewayChargeStatus,
          nextChargeAttemptAt: next.nextChargeAttemptAt,
          lastChargeError: "Pagamento recusado pelo gateway.",
        })
        .where(and(eq(invoices.id, invoiceId), eq(invoices.tenantId, tenantId)));

      await tx.insert(invoiceTimelineEvents).values({
        tenantId,
        invoiceId,
        type: "gateway_failure",
        payload: {
          provider,
          eventId,
          type,
          chargeId: data.chargeId,
          nextStatus: next.invoiceStatus,
          retryAt: next.nextChargeAttemptAt?.toISOString() ?? null,
        },
      });
      markedFailed = true;
    });
    if (studentId && markedFailed && becameUncollectible) {
      await recalculateStudentStatus(tenantId, studentId);
    }
    if (markedFailed) {
      await logAudit({
        tenantId,
        actorUserId: null,
        action: "invoice.payment_failed_webhook",
        entity: "invoice",
        entityId: invoiceId,
        payload: { provider, eventId, uncollectible: becameUncollectible },
      });
    }
  }
}
