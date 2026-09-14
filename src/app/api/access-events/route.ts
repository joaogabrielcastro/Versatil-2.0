import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { accessEvents, students } from "@/lib/db/schema";
import { withTenantTransaction } from "@/lib/db/with-tenant";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session || session.typ !== "tenant" || !session.tid) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const tenantId = session.tid;
  const rows = await withTenantTransaction(tenantId, async (tx) => {
    return tx
      .select({
        id: accessEvents.id,
        studentId: accessEvents.studentId,
        studentName: students.fullName,
        allowed: accessEvents.allowed,
        reason: accessEvents.reason,
        createdAt: accessEvents.createdAt,
      })
      .from(accessEvents)
      .leftJoin(students, eq(students.id, accessEvents.studentId))
      .where(eq(accessEvents.tenantId, tenantId))
      .orderBy(desc(accessEvents.createdAt))
      .limit(50);
  });

  return NextResponse.json({ events: rows });
}
