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
    });
    if (studentId) {
      await recalculateStudentStatus(tenantId, studentId);
    }
    return;
  }

  if (type === "invoice.payment_failed" && invoiceId) {
    let studentId: string | null = null;
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
    });
    if (studentId) {
      await recalculateStudentStatus(tenantId, studentId);
    }
  }
}
