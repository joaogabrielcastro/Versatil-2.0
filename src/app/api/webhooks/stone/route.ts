import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { logAudit } from "@/lib/audit/log";
import { jsonError } from "@/lib/api/json";
import { invoices } from "@/lib/db/schema";
import { withTenantTransaction } from "@/lib/db/with-tenant";
import { getEnv } from "@/lib/env";
import { stoneWebhookBodySchema } from "@/lib/integrations/stone-webhook";
import {
  getProviderConfig,
  type StoneConnectCredentials,
} from "@/lib/payments/config";
import {
  connectWebhookAmountCents,
  connectWebhookChargeId,
  normalizeStoneConnectWebhook,
  verifyStoneConnectWebhookSignature,
} from "@/lib/payments/providers/stone/connect-webhook";
import { getTenantIdBySlug } from "@/lib/tenant/resolve";
import { ingestWebhookEvent } from "@/lib/webhooks/ingest";
import { requireConfiguredBearer } from "@/lib/webhooks/require-bearer";

export const dynamic = "force-dynamic";

/**
 * Confirmação Stone:
 * 1) Contrato interno mapeado + Bearer STONE_WEBHOOK_SECRET
 * 2) Envelope Core v5 do Connect (`X-Hub-Signature`) + credencial do tenant
 */
export async function POST(request: Request) {
  const signature =
    request.headers.get("x-hub-signature") ??
    request.headers.get("x-hub-signature-256");

  if (signature) {
    return handleConnectCoreWebhook(request, signature);
  }

  const authz = requireConfiguredBearer(
    getEnv().STONE_WEBHOOK_SECRET,
    request.headers.get("authorization"),
    "STONE_WEBHOOK_SECRET não configurado.",
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

  const parsed = stoneWebhookBodySchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, "Payload inválido. Ver INTEGRACOES.md (Stone).");
  }

  return enqueueVerifiedStoneEvent({
    tenantId: parsed.data.tenantId,
    eventId: parsed.data.eventId,
    type: parsed.data.type,
    invoiceId: parsed.data.invoiceId,
    stoneChargeId: parsed.data.stoneChargeId,
    amountCents: parsed.data.amountCents,
    raw: parsed.data.raw ?? body,
  });
}

async function handleConnectCoreWebhook(request: Request, signature: string) {
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
    return jsonError(
      400,
      "Informe tenantId ou tenantSlug na URL do webhook Connect.",
    );
  }

  const cfg = await getProviderConfig<StoneConnectCredentials>(
    tenantId,
    "stone_connect",
  );
  const secret = cfg?.credentials.webhookSecret;
  if (!secret) {
    return jsonError(
      503,
      "Webhook HMAC do Stone Connect não configurado para o tenant.",
    );
  }

  const rawBody = await request.text();
  if (!verifyStoneConnectWebhookSignature(rawBody, signature, secret)) {
    return jsonError(401, "Assinatura do webhook inválida.");
  }

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(rawBody);
  } catch {
    return jsonError(400, "JSON inválido.");
  }

  const event = normalizeStoneConnectWebhook(
    parsedBody as Parameters<typeof normalizeStoneConnectWebhook>[0],
  );
  if (!event?.invoiceId) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  return enqueueVerifiedStoneEvent({
    tenantId,
    eventId: event.eventId,
    type: event.type,
    invoiceId: event.invoiceId,
    stoneChargeId: connectWebhookChargeId(
      parsedBody as Parameters<typeof connectWebhookChargeId>[0],
    ),
    amountCents: connectWebhookAmountCents(
      parsedBody as Parameters<typeof connectWebhookAmountCents>[0],
    ),
    raw: event.raw,
  });
}

async function enqueueVerifiedStoneEvent(data: {
  tenantId: string;
  eventId: string;
  type: string;
  invoiceId: string;
  stoneChargeId?: string;
  amountCents?: number;
  raw: unknown;
}) {
  const invoice = await withTenantTransaction(data.tenantId, async (tx) => {
    const [inv] = await tx
      .select({
        id: invoices.id,
        amountCents: invoices.amountCents,
        externalId: invoices.externalId,
      })
      .from(invoices)
      .where(
        and(
          eq(invoices.id, data.invoiceId),
          eq(invoices.tenantId, data.tenantId),
        ),
      )
      .limit(1);
    return inv ?? null;
  });

  if (!invoice) {
    return jsonError(404, "Fatura não encontrada para este tenant.");
  }
  if (
    data.stoneChargeId &&
    invoice.externalId &&
    data.stoneChargeId !== invoice.externalId
  ) {
    return jsonError(409, "Identificador da transação Stone não confere.");
  }
  if (
    data.amountCents !== undefined &&
    data.amountCents !== invoice.amountCents
  ) {
    return jsonError(409, "Valor da cobrança não confere com a fatura.");
  }

  const result = await ingestWebhookEvent({
    tenantId: data.tenantId,
    provider: "stone",
    eventId: data.eventId,
    type: data.type,
    invoiceId: data.invoiceId,
    raw: data.raw,
  });

  await logAudit({
    tenantId: data.tenantId,
    actorUserId: null,
    action: "webhook.stone_ingested",
    entity: "webhook",
    entityId: data.eventId,
    payload: {
      type: data.type,
      invoiceId: data.invoiceId,
      deduped: result.deduped,
    },
  });

  return NextResponse.json({
    ok: true,
    deduped: result.deduped,
    queued: result.queued,
  });
}
