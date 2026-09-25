/**
 * Fundação de pagamentos. O SaaS é Stone-only.
 *  - `manual`         → registro no balcão (dinheiro, Pix, cartão já recebido)
 *  - `stone_connect`  → maquininha POS (Stone Connect / API Core v5)
 */

export const PAYMENT_PROVIDER_IDS = ["manual", "stone_connect"] as const;

export type PaymentProviderId = (typeof PAYMENT_PROVIDER_IDS)[number];

export const PAYMENT_CAPABILITIES = [
  "manual_settlement",
  "pos_terminal",
] as const;

export type PaymentCapability = (typeof PAYMENT_CAPABILITIES)[number];

export type NormalizedPaymentEventType =
  | "invoice.paid"
  | "invoice.payment_failed";

export interface NormalizedPaymentEvent {
  provider: PaymentProviderId;
  eventId: string;
  type: NormalizedPaymentEventType;
  invoiceId?: string;
  raw?: unknown;
}

export class PaymentNotImplementedError extends Error {
  constructor(
    public readonly provider: PaymentProviderId,
    public readonly capability: string,
  ) {
    super(
      `Provedor "${provider}" não implementa "${capability}" no contrato disponível.`,
    );
    this.name = "PaymentNotImplementedError";
  }
}

export class PaymentProviderError extends Error {
  constructor(
    public readonly provider: PaymentProviderId,
    message: string,
    public readonly cause?: unknown,
    public readonly outcome: "unknown" | "rejected" = "rejected",
  ) {
    super(message);
    this.name = "PaymentProviderError";
  }
}
