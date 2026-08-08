import { createHmac, timingSafeEqual } from "crypto";
import type {
  NormalizedPaymentEvent,
  NormalizedPaymentEventType,
} from "@/lib/payments/types";

export const PAGARME_BASE_URL = "https://api.pagar.me/core/v5";

/** Métodos de pagamento suportados no checkout. */
export type PagarmePaymentMethod = "credit_card" | "pix" | "boleto";

/** Header Basic Auth: usuário = secret key, senha vazia. */
export function buildAuthHeader(secretKey: string): string {
  const token = Buffer.from(`${secretKey}:`, "utf8").toString("base64");
  return `Basic ${token}`;
}

export interface OrderCustomerInput {
  name: string;
  email?: string;
  /** CPF/CNPJ apenas dígitos. */
  document?: string;
}

export interface BuildOrderInput {
  invoiceId: string;
  tenantId: string;
  studentId: string;
  amountCents: number;
  description: string;
  method: PagarmePaymentMethod;
  customer: OrderCustomerInput;
  /** Cartão salvo (recorrência) — quando presente, usa credit_card com card_id. */
  cardId?: string;
  /** Parcelas para cartão (default 1). */
  installments?: number;
  /** Dias de expiração do boleto (default 3). */
  boletoExpiresInDays?: number;
}

/** Monta o corpo de POST /orders conforme a API v5. */
export function buildOrderPayload(input: BuildOrderInput): Record<string, unknown> {
  const amount = Math.max(1, Math.round(input.amountCents));

  const payment: Record<string, unknown> = { payment_method: input.method };
  if (input.method === "credit_card") {
    payment.credit_card = {
      installments: input.installments ?? 1,
      statement_descriptor: "ACADEMIA",
      ...(input.cardId ? { card_id: input.cardId } : {}),
    };
  } else if (input.method === "pix") {
    payment.pix = { expires_in: 3600 };
  } else if (input.method === "boleto") {
    payment.boleto = {
      instructions: "Pagar até o vencimento.",
      due_at: new Date(
        Date.now() + (input.boletoExpiresInDays ?? 3) * 86_400_000,
      ).toISOString(),
    };
  }

  const customer: Record<string, unknown> = { name: input.customer.name };
  if (input.customer.email) customer.email = input.customer.email;
  if (input.customer.document) {
    customer.document = input.customer.document;
    customer.type = input.customer.document.length > 11 ? "company" : "individual";
  }

  return {
    code: input.invoiceId,
    customer,
    items: [
      {
        amount,
        description: input.description.slice(0, 255),
        quantity: 1,
        code: input.invoiceId,
      },
    ],
    payments: [payment],
    metadata: {
      tenantId: input.tenantId,
      invoiceId: input.invoiceId,
      studentId: input.studentId,
    },
  };
}

/** Verifica a assinatura HMAC-SHA256 do webhook (header X-Hub-Signature). */
export function verifyWebhookSignature(
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

/** Traduz o `type` do evento Pagar.me para o tipo normalizado do núcleo. */
export function mapPagarmeEventType(
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

interface PagarmeWebhookBody {
  id?: string;
  type?: string;
  data?: {
    id?: string;
    code?: string;
    metadata?: Record<string, unknown>;
    order?: { code?: string; metadata?: Record<string, unknown> };
  };
}

/** Normaliza o corpo do webhook Pagar.me para o evento interno. */
export function normalizePagarmeWebhook(
  body: PagarmeWebhookBody,
): NormalizedPaymentEvent | null {
  const type = body.type ? mapPagarmeEventType(body.type) : null;
  if (!type) return null;

  const data = body.data ?? {};
  const metaInvoice =
    (data.metadata?.invoiceId as string | undefined) ??
    (data.order?.metadata?.invoiceId as string | undefined);
  const invoiceId = metaInvoice ?? data.code ?? data.order?.code;

  const eventId = body.id ?? data.id;
  if (!eventId) return null;

  return {
    provider: "pagarme",
    eventId,
    type,
    invoiceId: invoiceId ?? undefined,
    raw: body,
  };
}
