import "server-only";
import { and, eq, lte, or } from "drizzle-orm";
import { invoices, studentSubscriptions, students } from "@/lib/db/schema";
import {
  withBypassRlsTransaction,
  withTenantTransaction,
} from "@/lib/db/with-tenant";

export type StudentComputedStatus = "active" | "delinquent" | "inactive";

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
            and(eq(invoices.status, "open"), lte(invoices.dueAt, now)),
            eq(invoices.status, "uncollectible"),
          ),
        ),
      )
      .limit(1);

    if (badInvoices.length > 0) {
      await tx
        .update(students)
        .set({ status: "delinquent", updatedAt: now })
        .where(eq(students.id, studentId));
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

    const hasActivePlan = subs.some((s) => {
      if (s.startsAt.getTime() > now.getTime()) return false;
      if (s.endsAt && s.endsAt.getTime() < now.getTime()) return false;
      return true;
    });

    const next: StudentComputedStatus = hasActivePlan ? "active" : "inactive";
    await tx
      .update(students)
      .set({ status: next, updatedAt: now })
      .where(eq(students.id, studentId));
    return next;
  });
}

export async function recalculateAllStudents(): Promise<{ processed: number }> {
  const rows = await withBypassRlsTransaction(async (tx) => {
    return tx.select({ id: students.id, tenantId: students.tenantId }).from(students);
  });

  for (const r of rows) {
    await recalculateStudentStatus(r.tenantId, r.id);
  }
  return { processed: rows.length };
}
