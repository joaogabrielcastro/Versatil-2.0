import { NextResponse } from "next/server";
import { z } from "zod";
import { logAudit } from "@/lib/audit/log";
import { jsonError } from "@/lib/api/json";
import { isSessionError, requireTenantAdmin } from "@/lib/auth/guards";
import { withTenantTransaction } from "@/lib/db/with-tenant";
import { exportStudentData } from "@/lib/services/lgpd/student-privacy";

export const dynamic = "force-dynamic";

/** LGPD art. 18, II e V: cópia dos dados do aluno, para atender pedido do titular. */
export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await requireTenantAdmin();
  if (isSessionError(session)) return session;
  const tenantId = session.tid;
  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) {
    return jsonError(400, "ID inválido.");
  }

  const data = await withTenantTransaction(tenantId, (tx) =>
    exportStudentData(tx, tenantId, id),
  );
  if (!data) return jsonError(404, "Aluno não encontrado.");

  await logAudit({
    tenantId,
    actorUserId: session.sub,
    action: "student.data_exported",
    entity: "student",
    entityId: id,
    payload: {},
  });

  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="dados-aluno-${id.slice(0, 8)}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
