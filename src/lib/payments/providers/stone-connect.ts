import {
  getEnabledProviderConfig,
  type StoneConnectCredentials,
} from "@/lib/payments/config";
import type {
  ChargeStatusResult,
  PaymentProvider,
  RawWebhookRequest,
  TerminalChargeInput,
  TerminalChargeResult,
} from "@/lib/payments/provider";
import {
  STONE_CONNECT_HEADER,
  buildPosOrderPayload,
} from "@/lib/payments/providers/stone/api";
import {
  normalizeStoneConnectWebhook,
} from "@/lib/payments/providers/stone/connect-webhook";
import {
  StoneConnectHttpClient,
  mapStoneConnectChargeStatus,
} from "@/lib/payments/providers/stone/http";
import {
  PaymentNotImplementedError,
  PaymentProviderError,
  type NormalizedPaymentEvent,
} from "@/lib/payments/types";

/**
 * Stone Connect (POS). Transporte: API Core v5 + header ServiceRefererName.
 * Confirmação: webhook Core (`charge.paid`) ou contrato interno mapeado.
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

    const client = new StoneConnectHttpClient(cfg.credentials.secretKey);
    const order = await client.postOrder(payload, {
      [STONE_CONNECT_HEADER]: cfg.credentials.serviceRefererName,
    });

    return {
      externalId: order.charge?.id ?? order.id,
      status: "sent_to_terminal",
    };
  },

  async getChargeStatus(
    tenantId: string,
    externalId: string,
  ): Promise<ChargeStatusResult> {
    const cfg = await getEnabledProviderConfig<StoneConnectCredentials>(
      tenantId,
      "stone_connect",
    );
    if (!cfg?.credentials.secretKey) {
      throw new PaymentProviderError(
        "stone_connect",
        "Stone Connect não configurado.",
      );
    }
    const client = new StoneConnectHttpClient(cfg.credentials.secretKey);
    const charge = await client.getCharge(externalId);
    return {
      externalId: charge.id,
      status: mapStoneConnectChargeStatus(charge.status),
    };
  },

  /**
   * BLOQUEIO EXTERNO — o contrato Connect neste repositório não documenta
   * cancelamento/void. Não inventamos endpoint.
   */
  async cancelCharge(): Promise<void> {
    throw new PaymentNotImplementedError("stone_connect", "cancelCharge");
  },

  /**
   * BLOQUEIO EXTERNO — o contrato Connect neste repositório não documenta
   * refund/estorno. Não inventamos endpoint.
   */
  async refundCharge(): Promise<void> {
    throw new PaymentNotImplementedError("stone_connect", "refundCharge");
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
    return normalizeStoneConnectWebhook(
      body as Parameters<typeof normalizeStoneConnectWebhook>[0],
    );
  },
};
