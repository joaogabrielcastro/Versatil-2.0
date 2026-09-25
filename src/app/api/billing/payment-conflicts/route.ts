import { count, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api/json";
import { getSession } from "@/lib/auth/session";
import { invoices, paymentConflicts, students } from "@/lib/db/schema";
import { withTenantTransaction } from "@/lib/db/with-tenant";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session || session.typ !== "tenant" || !session.tid) {
    return jsonError(401, "Não autenticado.");
  }
  if (session.role !== "tenant_admin") {
    const [{ total }] = await withTenantTransaction(session.tid, async (tx) => {
      return tx
        .select({ total: count() })
        .from(paymentConflicts)
        .where(eq(paymentConflicts.tenantId, session.tid!));
    });
    return NextResponse.json({ reviewRequired: total > 0 });
  }
  const items = await withTenantTransaction(session.tid, async (tx) => {
    return tx
      .select({
        id: paymentConflicts.id,
        invoiceId: paymentConflicts.invoiceId,
        invoiceStatus: invoices.status,
        studentName: students.fullName,
        chargeId: paymentConflicts.chargeId,
        eventId: paymentConflicts.eventId,
        amountCents: paymentConflicts.amountCents,
        currency: paymentConflicts.currency,
        reason: paymentConflicts.reason,
        createdAt: paymentConflicts.createdAt,
      })
      .from(paymentConflicts)
      .innerJoin(invoices, eq(invoices.id, paymentConflicts.invoiceId))
      .innerJoin(students, eq(students.id, invoices.studentId))
      .where(eq(paymentConflicts.tenantId, session.tid!))
      .orderBy(desc(paymentConflicts.createdAt))
      .limit(50);
  });
  return NextResponse.json({ items, reviewRequired: items.length > 0 });
}
