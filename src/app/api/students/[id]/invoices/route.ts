import { and, desc, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError } from "@/lib/api/json";
import { getSession } from "@/lib/auth/session";
import {
  invoiceTimelineEvents,
  invoices,
  students,
} from "@/lib/db/schema";
import { withTenantTransaction } from "@/lib/db/with-tenant";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session || session.typ !== "tenant" || !session.tid) {
    return jsonError(401, "Não autenticado como equipe da academia.");
  }
  const tenantId = session.tid;
  const { id: studentId } = await ctx.params;
  if (!z.string().uuid().safeParse(studentId).success) {
    return jsonError(400, "ID inválido.");
  }

  const data = await withTenantTransaction(tenantId, async (tx) => {
    const [stu] = await tx
      .select({ id: students.id })
      .from(students)
      .where(eq(students.id, studentId))
      .limit(1);
    if (!stu) {
      return null;
    }

    const invs = await tx
      .select()
      .from(invoices)
      .where(eq(invoices.studentId, studentId))
      .orderBy(desc(invoices.createdAt));

    const ids = invs.map((i) => i.id);
    const timeline =
      ids.length === 0
        ? []
        : await tx
            .select()
            .from(invoiceTimelineEvents)
            .where(
              and(
                eq(invoiceTimelineEvents.tenantId, tenantId),
                inArray(invoiceTimelineEvents.invoiceId, ids),
              ),
            )
            .orderBy(desc(invoiceTimelineEvents.createdAt));

    return { invoices: invs, timeline };
  });

  if (!data) {
    return jsonError(404, "Aluno não encontrado.");
  }

  return NextResponse.json(data);
}
