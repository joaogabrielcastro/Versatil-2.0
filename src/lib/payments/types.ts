/**
 * Fundação de pagamentos (Fase 0).
 *
 * Abstrai provedores de pagamento para que o restante do sistema não dependa
 * de um provedor específico. Provedores previstos:
 *  - `manual`        → registro no balcão (dinheiro, Pix, cartão Stone) [ativo]
 *  - `pagarme`       → cobrança online / recorrência (Fase 1) [stub]
 *  - `stone_connect` → maquininha presencial POS (Fase 2) [stub]
 */

export const PAYMENT_PROVIDER_IDS = [
  "manual",
  "pagarme",
  "stone_connect",
] as const;

export type PaymentProviderId = (typeof PAYMENT_PROVIDER_IDS)[number];

/** O que um provedor é capaz de fazer. */
export const PAYMENT_CAPABILITIES = [
  /** Registrar um pagamento recebido fora do sistema (balcão). */
  "manual_settlement",
  /** Checkout/link avulso para pagamento online (uma fatura). */
  "online_checkout",
  /** Cartão salvo + cobrança recorrente automática. */
  "online_recurring",
  /** Cobrança em maquininha física (POS). */
  "pos_terminal",
] as const;

export type PaymentCapability = (typeof PAYMENT_CAPABILITIES)[number];

/** Eventos normalizados que qualquer provedor traduz para o núcleo. */
export type NormalizedPaymentEventType =
  | "invoice.paid"
  | "invoice.payment_failed";

export interface NormalizedPaymentEvent {
  provider: PaymentProviderId;
  /** ID único do evento no provedor (idempotência/dedupe). */
  eventId: string;
  type: NormalizedPaymentEventType;
  /** Fatura do Versátil associada, quando conhecida. */
  invoiceId?: string;
  raw?: unknown;
}

/** Lançada quando uma capability ainda não foi implementada pelo provedor. */
export class PaymentNotImplementedError extends Error {
  constructor(
    public readonly provider: PaymentProviderId,
    public readonly capability: PaymentCapability,
  ) {
    super(
      `Provedor "${provider}" ainda não implementa "${capability}" (fase futura).`,
    );
    this.name = "PaymentNotImplementedError";
  }
}

/** Erro genérico de provedor (falha de rede, credencial inválida, etc.). */
export class PaymentProviderError extends Error {
  constructor(
    public readonly provider: PaymentProviderId,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "PaymentProviderError";
  }
}
