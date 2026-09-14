import { NextResponse } from "next/server";
import { logAudit } from "@/lib/audit/log";
import { jsonError } from "@/lib/api/json";
import { getEnv } from "@/lib/env";
import { webhookJobSchema } from "@/lib/queues/job-payloads";
import { ingestWebhookEvent } from "@/lib/webhooks/ingest";
import { requireConfiguredBearer } from "@/lib/webhooks/require-bearer";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const authz = requireConfiguredBearer(
    getEnv().WEBHOOK_INGEST_SECRET,
    request.headers.get("authorization"),
    "WEBHOOK_INGEST_SECRET não configurado.",
  );
  if (!authz.ok) {
    return jsonError(authz.status, authz.error);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "JSON inválido.");
  }

  const parsed = webhookJobSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, "Payload inválido.");
  }

  const result = await ingestWebhookEvent(parsed.data);

  await logAudit({
    tenantId: parsed.data.tenantId,
    actorUserId: null,
    action: "webhook.ingested",
    entity: "webhook",
    entityId: parsed.data.eventId,
    payload: { provider: parsed.data.provider, type: parsed.data.type },
  });

  return NextResponse.json({
    ok: true,
    deduped: result.deduped,
    queued: result.queued,
  });
}
