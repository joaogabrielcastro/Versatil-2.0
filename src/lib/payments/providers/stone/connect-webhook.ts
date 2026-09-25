import { createHmac, timingSafeEqual } from "crypto";
import type {
  NormalizedPaymentEvent,
  NormalizedPaymentEventType,
} from "@/lib/payments/types";

/**
 * Confirmação do Stone Connect chega no mesmo envelope da API Core v5
 * (`charge.paid` / HMAC `X-Hub-Signature`). Não é o produto Pagar.me do SaaS.
 */

export function verifyStoneConnectWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
): boolean {
  if (!signatureHeader) return false;
  const received = signatureHeader.replace(/^sha256=/i, "").trim();
  const expected = createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("hex");
  const a = Buffer.from(received, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function mapStoneConnectEventType(
  type: string,
): NormalizedPaymentEventType | null {
  switch (type) {
    case "charge.paid":
    case "order.paid":
      return "invoice.paid";
    case "charge.payment_failed":
    case "charge.failed":
      return "invoice.payment_failed";
    default:
      return null;
  }
}

interface ConnectWebhookBody {
  id?: string;
  type?: string;
  data?: {
    id?: string;
    code?: string;
    amount?: number;
    currency?: string;
    metadata?: Record<string, unknown>;
    order?: { code?: string; metadata?: Record<string, unknown> };
  };
}

export function normalizeStoneConnectWebhook(
  body: ConnectWebhookBody,
): NormalizedPaymentEvent | null {
  const type = body.type ? mapStoneConnectEventType(body.type) : null;
  if (!type) return null;

  const data = body.data ?? {};
  const metaInvoice =
    (data.metadata?.invoiceId as string | undefined) ??
    (data.order?.metadata?.invoiceId as string | undefined);
  const invoiceId = metaInvoice ?? data.code ?? data.order?.code;
  const eventId = body.id ?? data.id;
  if (!eventId) return null;

  return {
    provider: "stone_connect",
    eventId,
    type,
    invoiceId: invoiceId ?? undefined,
    raw: body,
  };
}

export function connectWebhookAmountCents(
  body: ConnectWebhookBody,
): number | undefined {
  const amount = body.data?.amount;
  return typeof amount === "number" ? amount : undefined;
}

export function connectWebhookChargeId(
  body: ConnectWebhookBody,
): string | undefined {
  const id = body.data?.id;
  return typeof id === "string" && id.trim() ? id : undefined;
}

/** Moeda só entra se o envelope a trouxer. Ausência não vira BRL. */
export function connectWebhookCurrency(
  body: ConnectWebhookBody,
): string | undefined {
  const currency = body.data?.currency;
  if (typeof currency !== "string") return undefined;
  const normalized = currency.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(normalized) ? normalized : undefined;
}
