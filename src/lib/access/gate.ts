import { and, eq, or } from "drizzle-orm";
import { invoiceMayBlockAccess } from "@/lib/billing/access-effect";
import { dueBeforeToday } from "@/lib/billing/due-day-sql";
import { decideCoverage } from "@/lib/billing/renewal-billing";
import {
  recordRenewalBillingGap,
  renewalCoverageForStudent,
} from "@/lib/billing/renewal-access";
import { invoices, studentSubscriptions } from "@/lib/db/schema";
import type { DbTransaction } from "@/lib/db/with-tenant";
import { isSubscriptionActiveAt } from "@/lib/services/student-status-logic";

/** Resposta única para a catraca. O motivo fica só no access_events. */
export const PUBLIC_ACCESS_DENIAL = "Acesso não autorizado.";

export async function evaluateStudentAccess(
  tx: DbTransaction,
  tenantId: string,
  studentId: string,
  now = new Date(),
): Promise<{ allowed: boolean; internalReason: string | null }> {
  const badInvoices = await tx
    .select({ id: invoices.id })
    .from(invoices)
    .where(
      and(
        eq(invoices.tenantId, tenantId),
        eq(invoices.studentId, studentId),
        or(
          and(eq(invoices.status, "open"), dueBeforeToday(invoices.dueAt, now)),
          eq(invoices.status, "uncollectible"),
        ),
        invoiceMayBlockAccess(),
      ),
    )
    .limit(1);

  const subs = await tx
    .select({
      startsAt: studentSubscriptions.startsAt,
      endsAt: studentSubscriptions.endsAt,
      id: studentSubscriptions.id,
    })
    .from(studentSubscriptions)
    .where(
      and(
        eq(studentSubscriptions.tenantId, tenantId),
        eq(studentSubscriptions.studentId, studentId),
        eq(studentSubscriptions.active, true),
      ),
    );

  const renewal = await renewalCoverageForStudent(tx, tenantId, studentId, now);
  if (renewal.review) await recordRenewalBillingGap(tx, tenantId, renewal.review);

  const originalActive = subs.some((s) =>
    isSubscriptionActiveAt(s.startsAt, s.endsAt, now),
  );
  const decision = decideCoverage({
    hasBadInvoice: badInvoices.length > 0,
    originalActive,
    renewalCoversNow: renewal.coversNow,
    renewalChargeMissing: renewal.chargeMissing,
  });
  if (decision.allowed) return { allowed: true, internalReason: null };
  return { allowed: false, internalReason: decision.internalReason };
}

/** Falha de banco ou de dependência nunca abre a catraca. */
export function gateHttpResult(
  outcome: "allow" | "deny" | "unavailable" | "rate_limited",
): { status: number; body: { open: boolean; message?: string } } {
  if (outcome === "allow") return { status: 200, body: { open: true } };
  if (outcome === "rate_limited") {
    return { status: 429, body: { open: false, message: "Muitas tentativas." } };
  }
  if (outcome === "unavailable") {
    return { status: 503, body: { open: false, message: PUBLIC_ACCESS_DENIAL } };
  }
  return { status: 403, body: { open: false, message: PUBLIC_ACCESS_DENIAL } };
}
