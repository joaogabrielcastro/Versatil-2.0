import { and, asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api/json";
import { getSession } from "@/lib/auth/session";
import { invoices, students } from "@/lib/db/schema";
import { withTenantTransaction } from "@/lib/db/with-tenant";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session || session.typ !== "tenant" || !session.tid) {
    return jsonError(401, "Não autenticado.");
  }
  const tenantId = session.tid;
  const now = new Date();

  const items = await withTenantTransaction(tenantId, async (tx) => {
    return tx
      .select({
        invoiceId: invoices.id,
        studentId: invoices.studentId,
        studentName: students.fullName,
        amountCents: invoices.amountCents,
        currency: invoices.currency,
        dueAt: invoices.dueAt,
        status: invoices.status,
      })
      .from(invoices)
      .innerJoin(students, eq(students.id, invoices.studentId))
      .where(
        and(eq(invoices.tenantId, tenantId), eq(invoices.status, "open")),
      )
      .orderBy(asc(invoices.dueAt));
  });

  return NextResponse.json({
    items: items.map((row) => ({
      ...row,
      overdue: row.dueAt.getTime() <= now.getTime(),
    })),
  });
}
