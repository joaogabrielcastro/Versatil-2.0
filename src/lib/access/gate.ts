import { and, eq, gte, isNull, lte, or } from "drizzle-orm";
import { invoices, studentSubscriptions, subscriptionTerms } from "@/lib/db/schema";
import type { DbTransaction } from "@/lib/db/with-tenant";
import {
  computeStudentStatus,
  isSubscriptionActiveAt,
} from "@/lib/services/student-status-logic";

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
          and(eq(invoices.status, "open"), lte(invoices.dueAt, now)),
          eq(invoices.status, "uncollectible"),
        ),
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

  const renewalCoveringNow = await tx
    .select({ id: subscriptionTerms.id })
    .from(subscriptionTerms)
    .innerJoin(
      studentSubscriptions,
      eq(subscriptionTerms.subscriptionId, studentSubscriptions.id),
    )
    .where(
      and(
        eq(subscriptionTerms.tenantId, tenantId),
        eq(studentSubscriptions.studentId, studentId),
        eq(subscriptionTerms.source, "renewal"),
        lte(subscriptionTerms.startsAt, now),
        or(isNull(subscriptionTerms.endsAt), gte(subscriptionTerms.endsAt, now)),
      ),
    )
    .limit(1);

  const hasActivePlan =
    subs.some((s) => isSubscriptionActiveAt(s.startsAt, s.endsAt, now)) ||
    renewalCoveringNow.length > 0;
  const status = computeStudentStatus({
    hasBadInvoice: badInvoices.length > 0,
    hasActivePlan,
  });
  if (status === "active") return { allowed: true, internalReason: null };
  return {
    allowed: false,
    internalReason: status === "delinquent" ? "inadimplente" : "inativo",
  };
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
