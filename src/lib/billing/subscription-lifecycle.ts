import type { BillingInterval } from "@/lib/billing/interval-labels";
import { endOfPreviousCivilDay, periodDueAt } from "@/lib/billing/period";
import { toIsoDateInTz } from "@/lib/dates/br";

export type PaidPeriod = {
  dueAt: Date;
  interval: BillingInterval;
};

function day(date: Date): string {
  return toIsoDateInTz(date);
}

/** Início do ciclo seguinte. O dia civil desse instante não faz parte da cobertura. */
export function coverageEnd(period: PaidPeriod): Date {
  return periodDueAt(period.dueAt, period.interval, 1);
}

/** Último instante do último dia coberto. O acesso inclui esse dia inteiro. */
export function coverageInclusiveEnd(period: PaidPeriod): Date {
  return endOfPreviousCivilDay(coverageEnd(period));
}

/**
 * Se `now` cai dentro de um período pago, devolve o fim desse período.
 * Não usa a data do pagamento. Buraco entre faturas não é coberto.
 */
export function paidPeriodEnd(now: Date, paid: PaidPeriod[]): Date | null {
  const today = day(now);
  let end: Date | null = null;
  for (const period of paid) {
    const start = day(period.dueAt);
    const next = day(coverageEnd(period));
    if (today >= start && today < next) {
      const boundary = coverageInclusiveEnd(period);
      if (!end || boundary.getTime() > end.getTime()) end = boundary;
    }
  }
  return end;
}

export function invoicesToVoid(
  effectiveAt: Date,
  open: Array<{ id: string; dueAt: Date; gatewayChargeStatus: string }>,
): { voidIds: string[]; blockedByPos: string[] } {
  const cut = day(effectiveAt);
  const voidIds: string[] = [];
  const blockedByPos: string[] = [];
  for (const invoice of open) {
    if (invoice.gatewayChargeStatus === "pending") {
      blockedByPos.push(invoice.id);
      continue;
    }
    if (day(invoice.dueAt) < cut) continue;
    voidIds.push(invoice.id);
  }
  return { voidIds, blockedByPos };
}

export function nextCycleDue(
  startsAt: Date,
  interval: BillingInterval,
  now: Date,
  endsAt: Date | null,
): Date | null {
  for (let i = 0; i <= 240; i++) {
    const due = periodDueAt(startsAt, interval, i);
    if (day(due) > day(now)) {
      if (endsAt && day(due) > day(endsAt)) return null;
      return due;
    }
  }
  return null;
}
