import { getEnabledProviderConfig, type PagarmeCredentials } from "@/lib/payments/config";
import type {
  CreateCheckoutInput,
  CreateCheckoutResult,
  CreateRecurringChargeInput,
  PaymentProvider,
  RawWebhookRequest,
  RecurringChargeResult,
} from "@/lib/payments/provider";
import { PagarmeClient } from "@/lib/payments/providers/pagarme/client";
import {
  normalizePagarmeWebhook,
  type PagarmePaymentMethod,
} from "@/lib/payments/providers/pagarme/api";
import {
  PaymentProviderError,
  type NormalizedPaymentEvent,
} from "@/lib/payments/types";

function toPagarmeMethod(method: CreateCheckoutInput["method"]): PagarmePaymentMethod {
  return method === "card" ? "credit_card" : method;
}

/** Resolve um client Pagar.me autenticado para o tenant (throw se não configurado). */
export async function getPagarmeClient(tenantId: string): Promise<PagarmeClient> {
  const cfg = await getEnabledProviderConfig<PagarmeCredentials>(
    tenantId,
    "pagarme",
  );
  if (!cfg?.credentials.secretKey) {
    throw new PaymentProviderError(
      "pagarme",
      "Pagar.me não configurado ou desabilitado para esta academia.",
    );
  }
  return new PagarmeClient(cfg.credentials.secretKey);
}

const resolveClient = getPagarmeClient;

/**
 * Provedor Pagar.me (grupo Stone) — cobrança online (Pix/boleto/cartão) e
 * cobrança recorrente em cartão salvo. Credenciais por tenant (cifradas).
 */
export const pagarmeProvider: PaymentProvider = {
  id: "pagarme",
  label: "Pagar.me (online / recorrência)",
  capabilities: ["online_checkout", "online_recurring"],

  async createCheckout(
    input: CreateCheckoutInput,
  ): Promise<CreateCheckoutResult> {
    const client = await resolveClient(input.tenantId);
    const order = await client.createOrder({
      invoiceId: input.invoiceId,
      tenantId: input.tenantId,
      studentId: input.studentId,
      amountCents: input.amountCents,
      description: input.description,
      method: toPagarmeMethod(input.method),
      cardId: input.cardId,
      customer: {
        name: input.customerName,
        email: input.customerEmail,
        document: input.customerDocument?.replace(/\D/g, "") || undefined,
      },
    });

    if (!order.charge) {
      throw new PaymentProviderError(
        "pagarme",
        "Pedido criado sem cobrança associada.",
        order.raw,
      );
    }

    return {
      chargeId: order.charge.id,
      status: order.charge.status,
      url: order.charge.paymentUrl,
      pixQrCode: order.charge.pixQrCode,
    };
  },

  async createRecurringCharge(
    input: CreateRecurringChargeInput,
  ): Promise<RecurringChargeResult> {
    if (!input.paymentToken) {
      throw new PaymentProviderError(
        "pagarme",
        "Cobrança recorrente exige cartão salvo (card_id).",
      );
    }
    const client = await resolveClient(input.tenantId);
    const order = await client.createOrder({
      invoiceId: input.subscriptionId,
      tenantId: input.tenantId,
      studentId: input.studentId,
      amountCents: input.amountCents,
      description: "Mensalidade (recorrência)",
      method: "credit_card",
      cardId: input.paymentToken,
      customer: { name: "Aluno" },
    });
    if (!order.charge) {
      throw new PaymentProviderError(
        "pagarme",
        "Cobrança recorrente sem charge.",
        order.raw,
      );
    }
    return { externalId: order.charge.id, status: order.charge.status };
  },

  async normalizeWebhook(
    req: RawWebhookRequest,
  ): Promise<NormalizedPaymentEvent | null> {
    let body: unknown;
    try {
      body = JSON.parse(req.rawBody);
    } catch {
      return null;
    }
    return normalizePagarmeWebhook(body as Parameters<typeof normalizePagarmeWebhook>[0]);
  },
};
