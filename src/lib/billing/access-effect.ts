import { and, eq, or, sql } from "drizzle-orm";
import { invoices, plans } from "@/lib/db/schema";
import type { DbTransaction } from "@/lib/db/with-tenant";

export type AccessEffect = "block" | "none";

/** Taxas vencidas que impedem a entrada na unidade. */
export const ENROLLMENT_FEE_CODES = [
  "taxa-matricula-academia",
  "taxa-matricula-crossfit",
] as const;

/**
 * Taxas que permanecem no financeiro e não fecham a catraca.
 * A aula avulsa não autoriza entrada por esta classificação.
 */
export const NON_BLOCKING_FEE_CODES = [
  "taxa-nutricionista",
  "taxa-avaliacao-fisica",
  "taxa-aula-avulsa-crossfit",
] as const;

export function catalogFeeAccessEffect(code: string): AccessEffect | null {
  if ((ENROLLMENT_FEE_CODES as readonly string[]).includes(code)) return "block";
  if ((NON_BLOCKING_FEE_CODES as readonly string[]).includes(code)) return "none";
  return null;
}

/** Fatura de taxa marcada como none não entra na inadimplência da catraca. */
export function invoiceMayBlockAccess() {
  return or(
    sql`${invoices.purpose} IS DISTINCT FROM 'fee'`,
    sql`${invoices.accessEffect} IS DISTINCT FROM 'none'`,
  );
}

export function feeAccessLabel(accessEffect: string | null | undefined): string | null {
  if (accessEffect === "none") return "Não bloqueia a catraca.";
  if (accessEffect === "block") return "Se vencer, bloqueia a catraca.";
  return "Sem classificação de acesso: se vencer, ainda bloqueia a catraca.";
}

export async function feeAccessEffectForPlan(
  tx: DbTransaction,
  tenantId: string,
  planId: string,
): Promise<AccessEffect | null> {
  const [plan] = await tx
    .select({ kind: plans.kind, accessEffect: plans.accessEffect })
    .from(plans)
    .where(and(eq(plans.id, planId), eq(plans.tenantId, tenantId)))
    .limit(1);
  if (!plan || plan.kind !== "fee") {
    throw new Error("fee_plan_required");
  }
  if (plan.accessEffect === "block" || plan.accessEffect === "none") {
    return plan.accessEffect;
  }
  return null;
}
