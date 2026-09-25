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

export type SettleStatus =
  | "settled"
  | "already_settled"
  | "not_found"
  | "blocked_pending_pos";

export interface SettleResult {
  status: SettleStatus;
  studentId: string | null;
}

/** Entrada para cobrar numa maquininha física. */
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
  /** Mesma chave em timeout ou resposta perdida. Não gera segunda cobrança. */
  idempotencyKey?: string;
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

export interface ChargeStatusResult {
  externalId: string;
  status: "paid" | "failed" | "pending";
  /** Presentes só se a consulta devolver. Ausência não confirma pagamento. */
  amountCents?: number;
  currency?: string;
}

/**
 * Contrato comum. O domínio financeiro depende desta interface, nunca do
 * cliente HTTP do Connect.
 */
export interface PaymentProvider {
  readonly id: PaymentProviderId;
  readonly label: string;
  readonly capabilities: readonly PaymentCapability[];

  settleManual?(input: SettleManualInput): Promise<SettleResult>;

  chargeOnTerminal?(
    input: TerminalChargeInput,
  ): Promise<TerminalChargeResult>;

  getChargeStatus?(
    tenantId: string,
    externalId: string,
  ): Promise<ChargeStatusResult>;

  /** Só implementar se o contrato oficial do provedor documentar cancelamento. */
  cancelCharge?(tenantId: string, externalId: string): Promise<void>;

  /** Só implementar se o contrato oficial do provedor documentar estorno. */
  refundCharge?(tenantId: string, externalId: string): Promise<void>;

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
