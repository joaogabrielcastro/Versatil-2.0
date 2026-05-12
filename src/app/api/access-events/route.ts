import { desc } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { accessEvents } from "@/lib/db/schema";
import { withTenantTransaction } from "@/lib/db/with-tenant";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session || session.typ !== "tenant" || !session.tid) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const rows = await withTenantTransaction(session.tid, async (tx) => {
    return tx
      .select({
        id: accessEvents.id,
        studentId: accessEvents.studentId,
        allowed: accessEvents.allowed,
        reason: accessEvents.reason,
        createdAt: accessEvents.createdAt,
      })
      .from(accessEvents)
      .orderBy(desc(accessEvents.createdAt))
      .limit(50);
  });

  return NextResponse.json({ events: rows });
}
