import type { BillingInterval } from "@/lib/billing/interval-labels";
import { addDays, addMonths, periodDueAt } from "@/lib/billing/period";

/**
 * Término que cabe no prazo comercial do plano.
 * Mensal com prazo: N parcelas, e o dia seguinte ao término seria a parcela N+1.
 * Trimestral, semestral ou anual com prazo: uma cobrança, e o término cai
 * um dia antes do próximo ciclo.
 */
export function suggestedSubscriptionEnd(
  startsAt: Date,
  interval: BillingInterval,
  termMonths: number | null,
): Date | null {
  if (termMonths == null || termMonths < 1) return null;
  const nextCharge =
    interval === "monthly"
      ? addMonths(startsAt, termMonths)
      : periodDueAt(startsAt, interval, 1);
  return addDays(nextCharge, -1);
}
