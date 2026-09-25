import { sql, type SQL, type SQLWrapper } from "drizzle-orm";
import { toIsoDateInTz } from "@/lib/dates/br";

/** Mesma regra de `isInvoiceOverdue`, para consultas. */
export function dueBeforeToday(column: SQLWrapper, now = new Date()): SQL {
  const today = toIsoDateInTz(now);
  return sql`(${column} AT TIME ZONE 'America/Sao_Paulo')::date < ${today}::date`;
}
