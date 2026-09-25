/**
 * Confirmação de pagamento. Sem id da cobrança, valor e moeda compatíveis
 * com a fatura já vinculada, o evento não liquida.
 * Moeda ausente não vira BRL por omissão.
 */

export class WebhookSettlementRejected extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebhookSettlementRejected";
  }
}

export interface PaidEventClaims {
  chargeId?: string | null;
  amountCents?: number | null;
  currency?: string | null;
}

export interface InvoicePaymentLock {
  amountCents: number;
  currency: string;
  externalId: string | null;
  status: string;
}

export type PaidMatch =
  | { ok: true }
  | { ok: false; reason: string };

export function assertPaidWebhookMatchesInvoice(
  claims: PaidEventClaims,
  invoice: InvoicePaymentLock,
): PaidMatch {
  const chargeId = claims.chargeId?.trim() ?? "";
  if (!chargeId) {
    return { ok: false, reason: "Evento sem identificador da cobrança." };
  }
  if (claims.amountCents === undefined || claims.amountCents === null) {
    return { ok: false, reason: "Evento sem valor." };
  }
  if (!Number.isInteger(claims.amountCents) || claims.amountCents < 0) {
    return { ok: false, reason: "Valor do evento inválido." };
  }
  const currency = claims.currency?.trim().toUpperCase() ?? "";
  if (!/^[A-Z]{3}$/.test(currency)) {
    return { ok: false, reason: "Evento sem moeda compatível." };
  }
  if (!invoice.externalId) {
    return {
      ok: false,
      reason: "Fatura sem cobrança Stone vinculada.",
    };
  }
  if (invoice.externalId !== chargeId) {
    return { ok: false, reason: "Cobrança não pertence a esta fatura." };
  }
  if (claims.amountCents !== invoice.amountCents) {
    return { ok: false, reason: "Valor diverge da fatura." };
  }
  if (currency !== invoice.currency.trim().toUpperCase()) {
    return { ok: false, reason: "Moeda diverge da fatura." };
  }
  return { ok: true };
}

/** Falha de pagamento só altera a fatura da cobrança já vinculada. */
export function assertFailureChargeMatchesInvoice(
  chargeId: string | null | undefined,
  invoice: Pick<InvoicePaymentLock, "externalId">,
): PaidMatch {
  const id = chargeId?.trim() ?? "";
  if (!id) {
    return { ok: false, reason: "Falha sem identificador da cobrança." };
  }
  if (!invoice.externalId || invoice.externalId !== id) {
    return { ok: false, reason: "Cobrança não pertence a esta fatura." };
  }
  return { ok: true };
}
