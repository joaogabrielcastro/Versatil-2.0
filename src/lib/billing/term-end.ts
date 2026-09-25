import type { BillingInterval } from "@/lib/billing/interval-labels";
import { addMonths, endOfPreviousCivilDay, periodDueAt } from "@/lib/billing/period";

/**
 * Término do prazo comercial.
 * A próxima cobrança fica de fora. O acesso vale o dia civil anterior inteiro,
 * no fuso de São Paulo, e não começa o dia seguinte.
 * Mensal com prazo: N faturas. Outros intervalos com prazo: uma fatura.
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
  return endOfPreviousCivilDay(nextCharge);
}
