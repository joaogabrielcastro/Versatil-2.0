import type { DbTransaction } from "@/lib/db/with-tenant";
import type { ManualPaymentMethod } from "@/lib/billing/payment-methods";
import type {
  NormalizedPaymentEvent,
  PaymentCapability,
  PaymentProviderId,
} from "@/lib/payments/types";

/** Entrada para liquidar uma fatura manualmente (dentro de uma transação). */
export interface SettleManualInput {
  tx: DbTransaction;
  tenantId: string;
  invoiceId: string;
  paymentMethod?: ManualPaymentMethod | null;
  note?: string | null;
  actorUserId?: string | null;
}

export type SettleStatus = "settled" | "already_settled" | "not_found";

export interface SettleResult {
  status: SettleStatus;
  studentId: string | null;
}

/** Método de cobrança genérico (mapeado internamente por cada provedor). */
export type CheckoutMethod = "card" | "pix" | "boleto";

/** Entrada para gerar uma cobrança avulsa de uma fatura (Fase 1). */
export interface CreateCheckoutInput {
  tenantId: string;
  invoiceId: string;
  studentId: string;
  amountCents: number;
  currency: string;
  description: string;
  method: CheckoutMethod;
  customerName: string;
  customerEmail?: string;
  /** CPF/CNPJ (com ou sem máscara). */
  customerDocument?: string;
  /** Cartão salvo (para cobrança no cartão sem nova tokenização). */
  cardId?: string;
}

export interface CreateCheckoutResult {
  /** ID da cobrança no provedor. */
  chargeId: string;
  status: string;
  /** URL de pagamento (Pix/boleto), quando aplicável. */
  url?: string;
  /** Pix copia-e-cola, quando aplicável. */
  pixQrCode?: string;
}

/** Entrada para criar/renovar cobrança recorrente (Fase 1). */
export interface CreateRecurringChargeInput {
  tenantId: string;
  subscriptionId: string;
  studentId: string;
  amountCents: number;
  currency: string;
  /** Token/id do cartão salvo no provedor. */
  paymentToken?: string;
}

export interface RecurringChargeResult {
  externalId: string;
  status: string;
}

/** Entrada para cobrar numa maquininha física (Fase 2). */
export interface TerminalChargeInput {
  tenantId: string;
  invoiceId: string;
  studentId: string;
  amountCents: number;
  currency: string;
  description?: string;
  customerName?: string;
  customerEmail?: string;
  customerDocument?: string;
  /** Serial da maquininha (vazio usa o padrão configurado). */
  terminalSerial?: string;
  paymentType?: "credit" | "debit";
  installments?: number;
}

export interface TerminalChargeResult {
  externalId: string;
  status: "sent_to_terminal" | "paid" | "failed";
}

/** Requisição bruta recebida num webhook, para normalização pelo provedor. */
export interface RawWebhookRequest {
  headers: Headers;
  rawBody: string;
}

/**
 * Contrato comum a todos os provedores. Métodos são opcionais e devem existir
 * apenas quando a capability correspondente está em `capabilities`.
 */
export interface PaymentProvider {
  readonly id: PaymentProviderId;
  readonly label: string;
  readonly capabilities: readonly PaymentCapability[];

  /** Liquidação manual (capability `manual_settlement`). */
  settleManual?(input: SettleManualInput): Promise<SettleResult>;

  /** Checkout avulso (capability `online_checkout`). */
  createCheckout?(input: CreateCheckoutInput): Promise<CreateCheckoutResult>;

  /** Cobrança recorrente (capability `online_recurring`). */
  createRecurringCharge?(
    input: CreateRecurringChargeInput,
  ): Promise<RecurringChargeResult>;

  /** Cobrança em maquininha (capability `pos_terminal`). */
  chargeOnTerminal?(
    input: TerminalChargeInput,
  ): Promise<TerminalChargeResult>;

  /** Normaliza um webhook do provedor para um evento do núcleo. */
  normalizeWebhook?(
    req: RawWebhookRequest,
  ): Promise<NormalizedPaymentEvent | null>;
}

/** Helper de capability para uso fora dos provedores. */
export function providerSupports(
  provider: PaymentProvider,
  capability: PaymentCapability,
): boolean {
  return provider.capabilities.includes(capability);
}
