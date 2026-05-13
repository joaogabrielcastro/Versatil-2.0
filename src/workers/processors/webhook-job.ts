import { logAudit } from "@/lib/audit/log";
import { and, eq } from "drizzle-orm";
import {
  invoiceTimelineEvents,
  invoices,
} from "@/lib/db/schema";
import { withTenantTransaction } from "@/lib/db/with-tenant";
import { recalculateStudentStatus } from "@/lib/services/student-status";
import type { WebhookJobPayload } from "@/lib/queues/job-payloads";

export async function processWebhookJob(data: WebhookJobPayload): Promise<void> {
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
        })
        .where(eq(invoices.id, invoiceId));

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
    await withTenantTransaction(tenantId, async (tx) => {
      const [inv] = await tx
        .select({
          id: invoices.id,
          studentId: invoices.studentId,
        })
        .from(invoices)
        .where(and(eq(invoices.id, invoiceId), eq(invoices.tenantId, tenantId)))
        .limit(1);
      if (!inv) {
        return;
      }
      studentId = inv.studentId;
      await tx
        .update(invoices)
        .set({ status: "uncollectible" })
        .where(eq(invoices.id, invoiceId));

      await tx.insert(invoiceTimelineEvents).values({
        tenantId,
        invoiceId,
        type: "gateway_failure",
        payload: { provider, eventId, type, raw },
      });
      markedFailed = true;
    });
    if (studentId && markedFailed) {
      await recalculateStudentStatus(tenantId, studentId);
    }
    if (markedFailed) {
      await logAudit({
        tenantId,
        actorUserId: null,
        action: "invoice.payment_failed_webhook",
        entity: "invoice",
        entityId: invoiceId,
        payload: { provider, eventId },
      });
    }
  }
}
