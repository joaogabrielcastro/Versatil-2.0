import { and, eq } from "drizzle-orm";
import { webhookDedupe } from "@/lib/db/schema";
import { withBypassRlsTransaction } from "@/lib/db/with-tenant";
import { getQueue } from "@/lib/queues/bull";
import { WEBHOOK_JOB_OPTS } from "@/lib/queues/job-options";
import type { WebhookJobPayload } from "@/lib/queues/job-payloads";

export type WebhookProvider = WebhookJobPayload["provider"];

export async function ingestWebhookEvent(
  payload: WebhookJobPayload,
): Promise<{ queued: boolean; deduped: boolean }> {
  const inserted = await withBypassRlsTransaction(async (tx) => {
    return tx
      .insert(webhookDedupe)
      .values({
        tenantId: payload.tenantId,
        provider: payload.provider,
        eventId: payload.eventId,
        status: "received",
        attempts: 0,
        processedAt: null,
      })
      .onConflictDoNothing({
        target: [
          webhookDedupe.tenantId,
          webhookDedupe.provider,
          webhookDedupe.eventId,
        ],
      })
      .returning({
        id: webhookDedupe.id,
        status: webhookDedupe.status,
      });
  });

  let existingStatus: string | null = inserted[0]?.status ?? null;
  if (!existingStatus) {
    const row = await withBypassRlsTransaction(async (tx) => {
      const [found] = await tx
        .select({ status: webhookDedupe.status })
        .from(webhookDedupe)
        .where(
          and(
            eq(webhookDedupe.tenantId, payload.tenantId),
            eq(webhookDedupe.provider, payload.provider),
            eq(webhookDedupe.eventId, payload.eventId),
          ),
        )
        .limit(1);
      return found ?? null;
    });
    existingStatus = row?.status ?? null;
    if (
      existingStatus === "processed" ||
      existingStatus === "rejected"
    ) {
      return { queued: false, deduped: true };
    }
  }

  try {
    await getQueue("webhooks").add("webhook", payload, {
      ...WEBHOOK_JOB_OPTS,
      jobId: `wh:${payload.tenantId}:${payload.provider}:${payload.eventId}`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/already exists|duplicat/i.test(message)) {
      if (existingStatus === "failed") {
        const queue = getQueue("webhooks");
        const stuck = await queue.getJob(
          `wh:${payload.tenantId}:${payload.provider}:${payload.eventId}`,
        );
        if (stuck) {
          await stuck.retry();
          return { queued: true, deduped: false };
        }
        await queue.add("webhook", payload, {
          ...WEBHOOK_JOB_OPTS,
          jobId: `wh:${payload.tenantId}:${payload.provider}:${payload.eventId}:r${Date.now()}`,
        });
        return { queued: true, deduped: false };
      }
      return { queued: true, deduped: true };
    }
    throw err;
  }

  return { queued: true, deduped: false };
}

export async function markWebhookProcessing(
  tenantId: string,
  provider: string,
  eventId: string,
): Promise<void> {
  await withBypassRlsTransaction(async (tx) => {
    await tx
      .update(webhookDedupe)
      .set({
        status: "processing",
      })
      .where(
        and(
          eq(webhookDedupe.tenantId, tenantId),
          eq(webhookDedupe.provider, provider),
          eq(webhookDedupe.eventId, eventId),
        ),
      );
  });
}

export async function markWebhookProcessed(
  tenantId: string,
  provider: string,
  eventId: string,
): Promise<void> {
  await withBypassRlsTransaction(async (tx) => {
    await tx
      .update(webhookDedupe)
      .set({
        status: "processed",
        processedAt: new Date(),
        lastError: null,
      })
      .where(
        and(
          eq(webhookDedupe.tenantId, tenantId),
          eq(webhookDedupe.provider, provider),
          eq(webhookDedupe.eventId, eventId),
        ),
      );
  });
}

export async function markWebhookRejected(
  tenantId: string,
  provider: string,
  eventId: string,
  error: string,
): Promise<void> {
  await withBypassRlsTransaction(async (tx) => {
    await tx
      .update(webhookDedupe)
      .set({
        status: "rejected",
        processedAt: new Date(),
        lastError: error.slice(0, 500),
      })
      .where(
        and(
          eq(webhookDedupe.tenantId, tenantId),
          eq(webhookDedupe.provider, provider),
          eq(webhookDedupe.eventId, eventId),
        ),
      );
  });
}

export async function markWebhookFailed(
  tenantId: string,
  provider: string,
  eventId: string,
  error: string,
): Promise<void> {
  await withBypassRlsTransaction(async (tx) => {
    const [row] = await tx
      .select({ attempts: webhookDedupe.attempts })
      .from(webhookDedupe)
      .where(
        and(
          eq(webhookDedupe.tenantId, tenantId),
          eq(webhookDedupe.provider, provider),
          eq(webhookDedupe.eventId, eventId),
        ),
      )
      .limit(1);
    await tx
      .update(webhookDedupe)
      .set({
        status: "failed",
        attempts: (row?.attempts ?? 0) + 1,
        lastError: error.slice(0, 500),
      })
      .where(
        and(
          eq(webhookDedupe.tenantId, tenantId),
          eq(webhookDedupe.provider, provider),
          eq(webhookDedupe.eventId, eventId),
        ),
      );
  });
}
