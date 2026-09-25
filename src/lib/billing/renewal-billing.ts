import { isBillingInterval } from "@/lib/billing/interval-labels";
import {
  billablePeriodsForSubscription,
  type BillablePeriod,
} from "@/lib/billing/period";

/**
 * A vigência anterior inclui o último instante. A renovação começa no
 * instante seguinte, sem sobrepor esse instante e sem pular um dia.
 */
export function renewalStartsAt(previousEndsAt: Date): Date {
  return new Date(previousEndsAt.getTime() + 1);
}

export type RenewalChargeWindow = {
  subscriptionId: string;
  startsAt: Date;
  endsAt: Date | null;
  billingInterval: string;
  priceCents: number | null;
};

/**
 * Mensal: uma fatura por ciclo até o fim do termo.
 * Demais intervalos: uma fatura na data de início, cobrindo a vigência inteira.
 * O horizonte é o mesmo do gerador (hoje + lookahead). Lookahead 0 exige só
 * vencimentos até hoje.
 */
export function renewalChargePeriods(
  window: RenewalChargeWindow,
  now: Date,
  lookaheadDays = 7,
): { periods: BillablePeriod[]; review: string | null } {
  if (window.priceCents == null) {
    return {
      periods: [],
      review: "Renovação sem preço contratado. Período não faturado.",
    };
  }
  if (!isBillingInterval(window.billingInterval)) {
    return {
      periods: [],
      review: "Renovação com intervalo ausente ou inválido. Período não faturado.",
    };
  }
  const periods = billablePeriodsForSubscription(
    window.subscriptionId,
    window.startsAt,
    window.endsAt,
    window.billingInterval,
    now,
    lookaheadDays,
  );
  if (window.billingInterval === "monthly") {
    return { periods, review: null };
  }
  return { periods: periods.slice(0, 1), review: null };
}

export function renewalCoversInstant(
  startsAt: Date,
  endsAt: Date | null,
  now: Date,
): boolean {
  if (startsAt.getTime() > now.getTime()) return false;
  if (endsAt && endsAt.getTime() < now.getTime()) return false;
  return true;
}

export type CoverageDecision = {
  allowed: boolean;
  internalReason: "inadimplente" | "faturamento_pendente" | "inativo" | null;
  status: "active" | "delinquent" | "inactive";
};

/**
 * Fatura vencida continua sendo inadimplência. Renovação vigente sem a
 * cobrança que já deveria existir não conta como contrato regular.
 */
export function decideCoverage(input: {
  hasBadInvoice: boolean;
  originalActive: boolean;
  renewalCoversNow: boolean;
  renewalChargeMissing: boolean;
}): CoverageDecision {
  if (input.hasBadInvoice) {
    return { allowed: false, internalReason: "inadimplente", status: "delinquent" };
  }
  if (input.originalActive) {
    return { allowed: true, internalReason: null, status: "active" };
  }
  if (input.renewalCoversNow && input.renewalChargeMissing) {
    return {
      allowed: false,
      internalReason: "faturamento_pendente",
      status: "inactive",
    };
  }
  if (input.renewalCoversNow) {
    return { allowed: true, internalReason: null, status: "active" };
  }
  return { allowed: false, internalReason: "inativo", status: "inactive" };
}
