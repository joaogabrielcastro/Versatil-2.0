import { NextResponse } from "next/server";
import { z } from "zod";
import { logAudit } from "@/lib/audit/log";
import { jsonError } from "@/lib/api/json";
import { webhookDedupe } from "@/lib/db/schema";
import { withBypassRlsTransaction } from "@/lib/db/with-tenant";
import { getProviderConfig, type PagarmeCredentials } from "@/lib/payments/config";
import { getTenantIdBySlug } from "@/lib/tenant/resolve";
import {
  normalizePagarmeWebhook,
  verifyWebhookSignature,
} from "@/lib/payments/providers/pagarme/api";
import { getQueue } from "@/lib/queues/bull";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Webhook Pagar.me. Como cada academia tem sua própria conta Pagar.me, o tenant
 * é identificado pela query (`?tenantId=` ou `?tenantSlug=`) e a assinatura é
 * validada com o `webhookSecret` cifrado desse tenant.
 *
 * Configure no Pagar.me a URL: {APP_URL}/api/webhooks/pagarme?tenantSlug=SEU_SLUG
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const tenantIdParam = url.searchParams.get("tenantId");
  const tenantSlug = url.searchParams.get("tenantSlug");

  let tenantId: string | null = null;
  if (tenantIdParam && z.string().uuid().safeParse(tenantIdParam).success) {
    tenantId = tenantIdParam;
  } else if (tenantSlug) {
    tenantId = await getTenantIdBySlug(tenantSlug.toLowerCase());
  }
  if (!tenantId) {
    return jsonError(400, "Informe tenantId ou tenantSlug válido na URL do webhook.");
  }

  const cfg = await getProviderConfig<PagarmeCredentials>(tenantId, "pagarme");
  const secret = cfg?.credentials.webhookSecret;
  if (!secret) {
    return jsonError(503, "Pagar.me sem webhookSecret configurado para o tenant.");
  }

  const rawBody = await request.text();
  const signature =
    request.headers.get("x-hub-signature") ??
    request.headers.get("x-hub-signature-256");
  if (!verifyWebhookSignature(rawBody, signature, secret)) {
    return jsonError(401, "Assinatura do webhook inválida.");
  }

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(rawBody);
  } catch {
    return jsonError(400, "JSON inválido.");
  }

  const event = normalizePagarmeWebhook(
    parsedBody as Parameters<typeof normalizePagarmeWebhook>[0],
  );
  if (!event) {
    // Evento não relevante — responde 200 para evitar retry desnecessário.
    return NextResponse.json({ ok: true, ignored: true });
  }

  const inserted = await withBypassRlsTransaction(async (tx) => {
    return tx
      .insert(webhookDedupe)
      .values({ tenantId, provider: "pagarme", eventId: event.eventId })
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
    "pagarme",
    {
      tenantId,
      provider: "pagarme" as const,
      eventId: event.eventId,
      type: event.type,
      invoiceId: event.invoiceId,
      raw: event.raw,
    },
    { removeOnComplete: 100, removeOnFail: 50 },
  );

  await logAudit({
    tenantId,
    actorUserId: null,
    action: "webhook.pagarme_ingested",
    entity: "webhook",
    entityId: event.eventId,
    payload: { type: event.type, invoiceId: event.invoiceId ?? null },
  });

  return NextResponse.json({ ok: true });
}
