import { logAudit } from "@/lib/audit/log";
import { and, eq } from "drizzle-orm";
import {
  invoiceTimelineEvents,
  invoices,
} from "@/lib/db/schema";
import { withTenantTransaction } from "@/lib/db/with-tenant";
import { nextStateAfterPaymentFailed } from "@/lib/payments/recurring";
import { recalculateStudentStatus } from "@/lib/services/student-status";
import type { WebhookJobPayload } from "@/lib/queues/job-payloads";
import {
  markWebhookFailed,
  markWebhookProcessed,
  markWebhookProcessing,
} from "@/lib/webhooks/ingest";

export async function processWebhookJob(data: WebhookJobPayload): Promise<void> {
  const { tenantId, provider, eventId } = data;

  await markWebhookProcessing(tenantId, provider, eventId);
  try {
    await applyWebhookEvent(data);
    await markWebhookProcessed(tenantId, provider, eventId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await markWebhookFailed(tenantId, provider, eventId, message);
    throw err;
  }
}

async function applyWebhookEvent(data: WebhookJobPayload): Promise<void> {
  const { tenantId, type, invoiceId, raw, provider, eventId } = data;

  if (type === "invoice.paid" && invoiceId) {
    let studentId: string | null = null;
    let markedPaid = false;
    await withTenantTransaction(tenantId, async (tx) => {
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
        return;
      }
      studentId = inv.studentId;
      if (inv.status === "paid") {
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
        payload: { provider, eventId, type, raw },
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
        })
        .from(invoices)
        .where(and(eq(invoices.id, invoiceId), eq(invoices.tenantId, tenantId)))
        .limit(1);
      if (!inv) {
        return;
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
          raw,
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
