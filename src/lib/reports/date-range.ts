import "server-only";
import { dayRangeUtc, parseAttendanceDate } from "@/lib/services/attendance";
import { toIsoDateInTz } from "@/lib/dates/br";

const MAX_RANGE_DAYS = 366;
const DEFAULT_RANGE_DAYS = 30;

export type ReportDateRange = {
  from: string;
  to: string;
  fromUtc: Date;
  toExclusiveUtc: Date;
};

export function defaultReportRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - DEFAULT_RANGE_DAYS);
  return { from: toIsoDateInTz(from), to: toIsoDateInTz(to) };
}

function addDaysIso(iso: string, days: number): string {
  const d = parseAttendanceDate(iso);
  if (!d) return iso;
  d.setDate(d.getDate() + days);
  return toIsoDateInTz(d);
}

function daysBetweenInclusive(from: string, to: string): number {
  const a = parseAttendanceDate(from);
  const b = parseAttendanceDate(to);
  if (!a || !b) return 0;
  const ms = b.getTime() - a.getTime();
  return Math.floor(ms / (24 * 60 * 60 * 1000)) + 1;
}

/**
 * Interpreta from/to (YYYY-MM-DD). Default: últimos 30 dias.
 */
export function parseReportDateRange(
  fromParam: string | null,
  toParam: string | null,
): ReportDateRange | { error: string } {
  const defaults = defaultReportRange();
  const from = fromParam?.trim() || defaults.from;
  const to = toParam?.trim() || defaults.to;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return { error: "Datas inválidas (use YYYY-MM-DD)." };
  }

  const fromRange = dayRangeUtc(from);
  const toRange = dayRangeUtc(to);
  if (!fromRange || !toRange) {
    return { error: "Datas inválidas." };
  }

  if (from > to) {
    return { error: "Data inicial deve ser anterior ou igual à final." };
  }

  const span = daysBetweenInclusive(from, to);
  if (span > MAX_RANGE_DAYS) {
    return { error: `Período máximo de ${MAX_RANGE_DAYS} dias.` };
  }

  const toExclusiveUtc = toRange.to;

  return {
    from,
    to,
    fromUtc: fromRange.from,
    toExclusiveUtc,
  };
}

/** Lista de dias ISO inclusivos entre from e to. */
export function eachDayInRange(from: string, to: string): string[] {
  const days: string[] = [];
  let cur = from;
  while (cur <= to) {
    days.push(cur);
    if (cur === to) break;
    cur = addDaysIso(cur, 1);
  }
  return days;
}
