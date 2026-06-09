import type { BillingInterval } from "@/lib/billing/interval-labels";

const MONTHS_PER_INTERVAL: Record<BillingInterval, number> = {
  monthly: 1,
  semesterly: 6,
  yearly: 12,
};

export function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  if (d.getDate() !== day) {
    d.setDate(0);
  }
  return d;
}

export function periodDueAt(
  startsAt: Date,
  interval: BillingInterval,
  periodIndex: number,
): Date {
  const step = MONTHS_PER_INTERVAL[interval];
  return addMonths(startsAt, periodIndex * step);
}

export function subscriptionIdempotencyKey(
  subscriptionId: string,
  dueAt: Date,
): string {
  return `sub:${subscriptionId}:${dueAt.toISOString().slice(0, 10)}`;
}

export type BillablePeriod = {
  dueAt: Date;
  idempotencyKey: string;
};

export function billablePeriodsForSubscription(
  subscriptionId: string,
  startsAt: Date,
  endsAt: Date | null,
  interval: BillingInterval,
  now: Date,
  lookaheadDays = 7,
): BillablePeriod[] {
  const horizon = new Date(now);
  horizon.setDate(horizon.getDate() + lookaheadDays);

  const result: BillablePeriod[] = [];
  for (let i = 0; i <= 240; i++) {
    const dueAt = periodDueAt(startsAt, interval, i);
    if (dueAt > horizon) break;
    if (endsAt && dueAt > endsAt) break;
    if (dueAt < startsAt) continue;

    result.push({
      dueAt,
      idempotencyKey: subscriptionIdempotencyKey(subscriptionId, dueAt),
    });
  }
  return result;
}
