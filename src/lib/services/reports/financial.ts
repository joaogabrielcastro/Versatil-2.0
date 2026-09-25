import "server-only";
import { and, desc, eq, gte, isNotNull, lte } from "drizzle-orm";
import { dueBeforeToday } from "@/lib/billing/due-day-sql";
import { invoices, students } from "@/lib/db/schema";
import type { ReportDateRange } from "@/lib/reports/date-range";
import { countStudentsByEffectiveStatus } from "@/lib/services/student-effective-status";
import { withTenantTransaction } from "@/lib/db/with-tenant";

export type FinancialReport = {
  from: string;
  to: string;
  summary: {
    receivedCents: number;
    paidCount: number;
    openCents: number;
    openCount: number;
    overdueCents: number;
    overdueCount: number;
    studentsActive: number;
    studentsDelinquent: number;
    studentsInactive: number;
  };
  paidInPeriod: {
    invoiceId: string;
    studentId: string;
    studentName: string;
    amountCents: number;
    paidAt: string;
    settlementSource: string | null;
  }[];
  overdueOpen: {
    invoiceId: string;
    studentId: string;
    studentName: string;
    amountCents: number;
    dueAt: string;
  }[];
};

export async function buildFinancialReport(
  tenantId: string,
  range: ReportDateRange,
): Promise<FinancialReport> {
  const now = new Date();

  return withTenantTransaction(tenantId, async (tx) => {
    const statusTotals = await countStudentsByEffectiveStatus(tx, tenantId, now);
    const studentsActive = statusTotals.active;
    const studentsDelinquent = statusTotals.delinquent;
    const studentsInactive = statusTotals.inactive;

    const paidRows = await tx
      .select({
        invoiceId: invoices.id,
        studentId: invoices.studentId,
        studentName: students.fullName,
        amountCents: invoices.amountCents,
        paidAt: invoices.paidAt,
        settlementSource: invoices.settlementSource,
      })
      .from(invoices)
      .innerJoin(students, eq(students.id, invoices.studentId))
      .where(
        and(
          eq(invoices.tenantId, tenantId),
          eq(invoices.status, "paid"),
          isNotNull(invoices.paidAt),
          gte(invoices.paidAt, range.fromUtc),
          lte(invoices.paidAt, range.toExclusiveUtc),
        ),
      )
      .orderBy(desc(invoices.paidAt));

    const receivedCents = paidRows.reduce((s, r) => s + r.amountCents, 0);

    const openRows = await tx
      .select({
        amountCents: invoices.amountCents,
      })
      .from(invoices)
      .where(
        and(eq(invoices.tenantId, tenantId), eq(invoices.status, "open")),
      );

    const openCents = openRows.reduce((s, r) => s + r.amountCents, 0);

    const overdueRows = await tx
      .select({
        invoiceId: invoices.id,
        studentId: invoices.studentId,
        studentName: students.fullName,
        amountCents: invoices.amountCents,
        dueAt: invoices.dueAt,
      })
      .from(invoices)
      .innerJoin(students, eq(students.id, invoices.studentId))
      .where(
        and(
          eq(invoices.tenantId, tenantId),
          eq(invoices.status, "open"),
          dueBeforeToday(invoices.dueAt, now),
        ),
      )
      .orderBy(invoices.dueAt);

    const overdueCents = overdueRows.reduce((s, r) => s + r.amountCents, 0);

    return {
      from: range.from,
      to: range.to,
      summary: {
        receivedCents,
        paidCount: paidRows.length,
        openCents,
        openCount: openRows.length,
        overdueCents,
        overdueCount: overdueRows.length,
        studentsActive,
        studentsDelinquent,
        studentsInactive,
      },
      paidInPeriod: paidRows
        .filter((r) => r.paidAt != null)
        .map((r) => ({
          invoiceId: r.invoiceId,
          studentId: r.studentId,
          studentName: r.studentName,
          amountCents: r.amountCents,
          paidAt: r.paidAt!.toISOString(),
          settlementSource: r.settlementSource,
        })),
      overdueOpen: overdueRows.map((r) => ({
        invoiceId: r.invoiceId,
        studentId: r.studentId,
        studentName: r.studentName,
        amountCents: r.amountCents,
        dueAt: r.dueAt.toISOString(),
      })),
    };
  });
}
