import { toIsoDateInTz } from "@/lib/dates/br";

/**
 * Vencimento por dia civil em America/Sao_Paulo.
 * Atrasada só quando o dia do vencimento é anterior a hoje.
 * O horário gravado no mesmo dia não antecipa a inadimplência.
 */
export function isInvoiceOverdue(
  dueAt: Date | string,
  now = new Date(),
): boolean {
  const due = dueAt instanceof Date ? dueAt : new Date(dueAt);
  if (Number.isNaN(due.getTime())) return false;
  return toIsoDateInTz(due) < toIsoDateInTz(now);
}
