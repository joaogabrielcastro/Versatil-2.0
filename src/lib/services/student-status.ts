import { and, eq, or } from "drizzle-orm";
import { invoiceMayBlockAccess } from "@/lib/billing/access-effect";
import { dueBeforeToday } from "@/lib/billing/due-day-sql";
import {
  recordRenewalBillingGap,
  renewalCoverageForStudent,
} from "@/lib/billing/renewal-access";
import { decideCoverage } from "@/lib/billing/renewal-billing";
import {
  invoices,
  studentSubscriptions,
  students,
} from "@/lib/db/schema";
import {
  withBypassRlsTransaction,
  withTenantTransaction,
} from "@/lib/db/with-tenant";
import { log } from "@/lib/observability/logger";
import { isSubscriptionActiveAt, type StudentComputedStatus } from "@/lib/services/student-status-logic";

export type { StudentComputedStatus };

/**
 * Recalcula status do aluno: inadimplente (fatura em aberto vencida ou incobrável),
 * ativo (plano vigente e sem pendência), inativo (caso contrário).
 */
export async function recalculateStudentStatus(
  tenantId: string,
  studentId: string,
): Promise<StudentComputedStatus> {
  const now = new Date();

  return withTenantTransaction(tenantId, async (tx) => {
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

    if (badInvoices.length > 0) {
      await tx
        .update(students)
        .set({ status: "delinquent", updatedAt: now })
        .where(
          and(eq(students.id, studentId), eq(students.tenantId, tenantId)),
        );
      return "delinquent";
    }

    const subs = await tx
      .select({
        startsAt: studentSubscriptions.startsAt,
        endsAt: studentSubscriptions.endsAt,
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
    const next = decideCoverage({
      hasBadInvoice: badInvoices.length > 0,
      originalActive,
      renewalCoversNow: renewal.coversNow,
      renewalChargeMissing: renewal.chargeMissing,
    }).status;
    await tx
      .update(students)
      .set({ status: next, updatedAt: now })
      .where(
        and(eq(students.id, studentId), eq(students.tenantId, tenantId)),
      );
    return next;
  });
}

export async function recalculateAllStudents(): Promise<{
  processed: number;
  failedTenantIds: string[];
}> {
  const rows = await withBypassRlsTransaction(async (tx) => {
    return tx.select({ id: students.id, tenantId: students.tenantId }).from(students);
  });

  const failed = new Set<string>();
  let processed = 0;
  for (const r of rows) {
    try {
      await recalculateStudentStatus(r.tenantId, r.id);
      processed++;
    } catch (err) {
      failed.add(r.tenantId);
      log.error("cron.tenant_failed", {
        job: "recalculate-students",
        tenantId: r.tenantId,
        error: err instanceof Error ? err.message : "erro",
      });
    }
  }
  return { processed, failedTenantIds: [...failed] };
}
