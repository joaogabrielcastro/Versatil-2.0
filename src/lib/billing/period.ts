import { TZ_BR } from "@/lib/dates/br";
import type { BillingInterval } from "@/lib/billing/interval-labels";

const MONTHS_PER_INTERVAL: Record<BillingInterval, number> = {
  monthly: 1,
  quarterly: 3,
  semesterly: 6,
  yearly: 12,
};

type CivilDate = { y: number; m: number; d: number };

function civilDate(date: Date, timeZone = TZ_BR): CivilDate {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const read = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value);
  return { y: read("year"), m: read("month"), d: read("day") };
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Meio-dia em São Paulo, estável o ano todo (sem horário de verão desde 2019). */
function atSaoPauloNoon(date: CivilDate): Date {
  return new Date(Date.UTC(date.y, date.m - 1, date.d, 15, 0, 0));
}

/** 00:00 em São Paulo. */
function atSaoPauloStart(date: CivilDate): Date {
  return new Date(Date.UTC(date.y, date.m - 1, date.d, 3, 0, 0, 0));
}

/**
 * Último instante do dia civil anterior ao dia de `date`, em São Paulo.
 * A vigência inclui esse dia inteiro e exclui o dia seguinte.
 */
export function endOfPreviousCivilDay(date: Date): Date {
  return new Date(atSaoPauloStart(civilDate(date)).getTime() - 1);
}

function addCalendarMonths(date: CivilDate, months: number): CivilDate {
  const index = date.y * 12 + (date.m - 1) + months;
  const y = Math.floor(index / 12);
  const m = (index % 12) + 1;
  const d = Math.min(date.d, daysInMonth(y, m));
  return { y, m, d };
}

function addCalendarDays(date: CivilDate, days: number): CivilDate {
  const utc = new Date(Date.UTC(date.y, date.m - 1, date.d + days));
  return {
    y: utc.getUTCFullYear(),
    m: utc.getUTCMonth() + 1,
    d: utc.getUTCDate(),
  };
}

function compareCivil(a: CivilDate, b: CivilDate): number {
  if (a.y !== b.y) return a.y - b.y;
  if (a.m !== b.m) return a.m - b.m;
  return a.d - b.d;
}

export function addMonths(date: Date, months: number): Date {
  return atSaoPauloNoon(addCalendarMonths(civilDate(date), months));
}

export function addDays(date: Date, days: number): Date {
  return atSaoPauloNoon(addCalendarDays(civilDate(date), days));
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
  const { y, m, d } = civilDate(dueAt);
  const iso = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return `sub:${subscriptionId}:${iso}`;
}

export type BillablePeriod = {
  dueAt: Date;
  idempotencyKey: string;
};

/**
 * Períodos devidos até hoje + lookahead, no calendário de São Paulo.
 * Inclui ciclos já vencidos enquanto a assinatura ainda está vigente:
 * é a recuperação se o cron falhou alguns dias. Não gera período depois de endsAt.
 */
export function billablePeriodsForSubscription(
  subscriptionId: string,
  startsAt: Date,
  endsAt: Date | null,
  interval: BillingInterval,
  now: Date,
  lookaheadDays = 7,
): BillablePeriod[] {
  const start = civilDate(startsAt);
  const horizon = addCalendarDays(civilDate(now), lookaheadDays);
  const end = endsAt ? civilDate(endsAt) : null;

  const result: BillablePeriod[] = [];
  for (let i = 0; i <= 240; i++) {
    const due = addCalendarMonths(start, i * MONTHS_PER_INTERVAL[interval]);
    if (compareCivil(due, horizon) > 0) break;
    if (end && compareCivil(due, end) > 0) break;
    if (compareCivil(due, start) < 0) continue;

    const dueAt = atSaoPauloNoon(due);
    result.push({
      dueAt,
      idempotencyKey: subscriptionIdempotencyKey(subscriptionId, dueAt),
    });
  }
  return result;
}
