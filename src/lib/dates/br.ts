/** Fuso horário padrão da academia (Brasil). */
export const TZ_BR = "America/Sao_Paulo";

const dateOpts: Intl.DateTimeFormatOptions = {
  timeZone: TZ_BR,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
};

const dateTimeOpts: Intl.DateTimeFormatOptions = {
  ...dateOpts,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
};

const timeOpts: Intl.DateTimeFormatOptions = {
  timeZone: TZ_BR,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
};

function toDate(value: Date | string | number): Date {
  return value instanceof Date ? value : new Date(value);
}

/** Ex.: 27/05/2026 */
export function formatDateBr(value: Date | string | number): string {
  const d = toDate(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", dateOpts);
}

/** Ex.: 27/05/2026, 14:30 */
export function formatDateTimeBr(value: Date | string | number): string {
  const d = toDate(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", dateTimeOpts);
}

/** Ex.: 14:30 */
export function formatTimeBr(value: Date | string | number): string {
  const d = toDate(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("pt-BR", timeOpts);
}

/** Converte YYYY-MM-DD → dd/mm/aaaa */
export function formatIsoDateBr(isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  if (!y || !m || !d) return isoDate;
  return `${d.padStart(2, "0")}/${m.padStart(2, "0")}/${y}`;
}

/** Data civil ISO (YYYY-MM-DD) no fuso de São Paulo — uso interno/API. */
export function toIsoDateInTz(d: Date = new Date()): string {
  return d.toLocaleDateString("en-CA", { timeZone: TZ_BR });
}

/**
 * Interpreta dd/mm/aaaa ou dd/mm/aaaa HH:mm (24h).
 * Retorna null se inválido.
 */
export function parseDateBr(input: string): Date | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const m = trimmed.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/,
  );
  if (!m) return null;

  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  const hour = m[4] !== undefined ? Number(m[4]) : 12;
  const minute = m[5] !== undefined ? Number(m[5]) : 0;

  const d = new Date(year, month - 1, day, hour, minute, 0, 0);
  if (
    Number.isNaN(d.getTime()) ||
    d.getFullYear() !== year ||
    d.getMonth() !== month - 1 ||
    d.getDate() !== day
  ) {
    return null;
  }
  return d;
}

/** Converte Date → string dd/mm/aaaa para preencher inputs. */
export function toDateInputBr(value: Date | string | number): string {
  return formatDateBr(value);
}

/** Converte Date → string dd/mm/aaaa HH:mm para preencher inputs. */
export function toDateTimeInputBr(value: Date | string | number): string {
  const d = toDate(value);
  if (Number.isNaN(d.getTime())) return "";
  const date = formatDateBr(d);
  const time = d.toLocaleTimeString("pt-BR", {
    timeZone: TZ_BR,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `${date} ${time}`;
}

/** Máscara dd/mm/aaaa enquanto digita (só dígitos → barras automáticas). */
export function maskDateBrInput(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

/** Máscara dd/mm/aaaa HH:mm enquanto digita. */
export function maskDateTimeBrInput(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 12);
  const datePart = maskDateBrInput(digits.slice(0, 8));
  if (digits.length <= 8) return datePart;
  const t = digits.slice(8);
  if (t.length <= 2) return `${datePart} ${t}`;
  return `${datePart} ${t.slice(0, 2)}:${t.slice(2, 4)}`;
}

/** Normaliza valor digitado (ex.: 5/3/2026 → 05/03/2026) após sair do campo. */
export function normalizeDateBrInput(input: string, withTime = false): string {
  const trimmed = input.trim();
  if (!trimmed) return "";
  const parsed = parseDateBr(trimmed);
  if (parsed) {
    return withTime ? toDateTimeInputBr(parsed) : toDateInputBr(parsed);
  }
  return withTime ? maskDateTimeBrInput(trimmed) : maskDateBrInput(trimmed);
}
