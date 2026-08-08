import {
  getEnabledProviderConfig,
  type StoneConnectCredentials,
} from "@/lib/payments/config";
import type {
  PaymentProvider,
  RawWebhookRequest,
  TerminalChargeInput,
  TerminalChargeResult,
} from "@/lib/payments/provider";
import { PagarmeClient } from "@/lib/payments/providers/pagarme/client";
import { normalizePagarmeWebhook } from "@/lib/payments/providers/pagarme/api";
import {
  STONE_CONNECT_HEADER,
  buildPosOrderPayload,
} from "@/lib/payments/providers/stone/api";
import {
  PaymentProviderError,
  type NormalizedPaymentEvent,
} from "@/lib/payments/types";

/**
 * Provedor Stone Connect (POS / maquininha presencial).
 *
 * Roda sobre a API do Pagar.me: cria um pedido aberto (`closed:false`) com
 * `poi_payment_settings` direcionado ao serial do POS. O pagamento é feito na
 * maquininha e a confirmação chega pelo webhook `charge.paid` do Pagar.me
 * (mesma rota `/api/webhooks/pagarme`).
 *
 * Requer habilitação comercial no Stone Partner Program (ServiceRefererName).
 */
export const stoneConnectProvider: PaymentProvider = {
  id: "stone_connect",
  label: "Stone Connect (maquininha)",
  capabilities: ["pos_terminal"],

  async chargeOnTerminal(
    input: TerminalChargeInput,
  ): Promise<TerminalChargeResult> {
    const cfg = await getEnabledProviderConfig<StoneConnectCredentials>(
      input.tenantId,
      "stone_connect",
    );
    if (!cfg?.credentials.secretKey || !cfg.credentials.serviceRefererName) {
      throw new PaymentProviderError(
        "stone_connect",
        "Stone Connect não configurado (secret key + ServiceRefererName).",
      );
    }

    const serial = input.terminalSerial || cfg.credentials.defaultTerminalSerial;
    if (!serial) {
      throw new PaymentProviderError(
        "stone_connect",
        "Informe o serial da maquininha (ou configure um padrão).",
      );
    }

    const payload = buildPosOrderPayload({
      invoiceId: input.invoiceId,
      tenantId: input.tenantId,
      studentId: input.studentId,
      amountCents: input.amountCents,
      description: input.description ?? "Mensalidade",
      customerName: input.customerName ?? "Aluno",
      customerEmail: input.customerEmail,
      customerDocument: input.customerDocument?.replace(/\D/g, "") || undefined,
      terminalSerials: [serial],
      paymentType: input.paymentType ?? cfg.credentials.paymentType ?? "credit",
      installments: input.installments,
    });

    const client = new PagarmeClient(cfg.credentials.secretKey);
    const order = await client.postOrder(payload, {
      [STONE_CONNECT_HEADER]: cfg.credentials.serviceRefererName,
    });

    return {
      externalId: order.charge?.id ?? order.id,
      status: "sent_to_terminal",
    };
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
    return normalizePagarmeWebhook(
      body as Parameters<typeof normalizePagarmeWebhook>[0],
    );
  },
};
