import { isInvoiceOverdue } from "@/lib/billing/due-day";

export type FinanceSituation =
  | "open"
  | "overdue"
  | "paid"
  | "void"
  | "uncollectible"
  | "draft";

export type PosSituation = "none" | "pending" | "unknown" | "refused" | "succeeded";

const FINANCE_LABEL: Record<FinanceSituation, string> = {
  open: "Em aberto",
  overdue: "Vencida",
  paid: "Paga",
  void: "Anulada",
  uncollectible: "Incobrável",
  draft: "Rascunho",
};

const POS_LABEL: Record<Exclude<PosSituation, "none" | "succeeded">, string> = {
  pending: "Aguardando confirmação da maquininha",
  unknown: "Resultado desconhecido na maquininha",
  refused: "Recusada na maquininha",
};

export function financeSituation(
  status: string,
  dueAt: Date | string,
  now = new Date(),
): FinanceSituation {
  if (status === "paid") return "paid";
  if (status === "void") return "void";
  if (status === "uncollectible") return "uncollectible";
  if (status === "draft") return "draft";
  return isInvoiceOverdue(dueAt, now) ? "overdue" : "open";
}

export function posSituation(input: {
  gatewayChargeStatus?: string | null;
  externalId?: string | null;
  gatewayIdempotencyKey?: string | null;
}): PosSituation {
  const status = input.gatewayChargeStatus ?? "idle";
  if (status === "failed") return "refused";
  if (status === "succeeded") return "succeeded";
  if (status === "pending") {
    if (!input.externalId && input.gatewayIdempotencyKey) return "unknown";
    return "pending";
  }
  return "none";
}

export function financeLabel(situation: FinanceSituation): string {
  return FINANCE_LABEL[situation];
}

export function posLabel(situation: PosSituation): string | null {
  if (situation === "none" || situation === "succeeded") return null;
  return POS_LABEL[situation];
}

export function manualSettlementBlockReason(pos: PosSituation): string | null {
  if (pos === "pending" || pos === "unknown") {
    return "Aguardando confirmação da maquininha. Consulte a transação antes de registrar outro pagamento.";
  }
  return null;
}

export function canSendToPos(pos: PosSituation, finance: FinanceSituation): boolean {
  if (finance !== "open" && finance !== "overdue") return false;
  return pos === "none" || pos === "refused";
}
