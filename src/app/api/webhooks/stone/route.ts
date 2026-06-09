import { NextResponse } from "next/server";
import { logAudit } from "@/lib/audit/log";
import { jsonError } from "@/lib/api/json";
import { webhookDedupe } from "@/lib/db/schema";
import { withBypassRlsTransaction } from "@/lib/db/with-tenant";
import { getEnv } from "@/lib/env";
import { stoneWebhookBodySchema } from "@/lib/integrations/stone-webhook";
import { getQueue } from "@/lib/queues/bull";

export const dynamic = "force-dynamic";

/**
 * Webhook Stone — Fase 2 (estrutura pronta).
 * Configure STONE_WEBHOOK_SECRET no .env quando tiver credenciais Stone.
 *
 * Payload esperado (contrato interno):
 * {
 *   "tenantId": "uuid",
 *   "eventId": "id-unico-do-evento-stone",
 *   "type": "invoice.paid" | "invoice.payment_failed",
 *   "invoiceId": "uuid-da-fatura-no-versatil",
 *   "stoneChargeId": "opcional",
 *   "raw": { ...payload original Stone }
 * }
 */
export async function POST(request: Request) {
  const secret = getEnv().STONE_WEBHOOK_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return jsonError(401, "Não autorizado.");
    }
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "JSON inválido.");
  }

  const parsed = stoneWebhookBodySchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, "Payload inválido. Ver INTEGRACOES.md (Stone).");
  }

  const data = parsed.data;

  const inserted = await withBypassRlsTransaction(async (tx) => {
    return tx
      .insert(webhookDedupe)
      .values({
        tenantId: data.tenantId,
        provider: "stone",
        eventId: data.eventId,
      })
      .onConflictDoNothing({
        target: [
          webhookDedupe.tenantId,
          webhookDedupe.provider,
          webhookDedupe.eventId,
        ],
      })
      .returning({ id: webhookDedupe.id });
  });

  if (inserted.length === 0) {
    return NextResponse.json({ ok: true, deduped: true });
  }

  await getQueue("webhooks").add(
    "stone",
    {
      tenantId: data.tenantId,
      provider: "stone" as const,
      eventId: data.eventId,
      type: data.type,
      invoiceId: data.invoiceId,
      raw: data.raw ?? body,
    },
    { removeOnComplete: 100, removeOnFail: 50 },
  );

  await logAudit({
    tenantId: data.tenantId,
    actorUserId: null,
    action: "webhook.stone_ingested",
    entity: "webhook",
    entityId: data.eventId,
    payload: { type: data.type, invoiceId: data.invoiceId },
  });

  return NextResponse.json({ ok: true, deduped: false });
}
