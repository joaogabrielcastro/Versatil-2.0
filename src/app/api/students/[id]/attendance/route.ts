import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError } from "@/lib/api/json";
import { getSession } from "@/lib/auth/session";
import { listStudentAttendanceDays, toAttendanceDate } from "@/lib/services/attendance";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session || session.typ !== "tenant" || !session.tid) {
    return jsonError(401, "Não autenticado.");
  }
  const tenantId = session.tid;
  const { id: studentId } = await ctx.params;
  if (!z.string().uuid().safeParse(studentId).success) {
    return jsonError(400, "ID inválido.");
  }

  const url = new URL(request.url);
  const from = url.searchParams.get("from") ?? undefined;
  const to = url.searchParams.get("to") ?? undefined;
  const limit = Math.min(
    365,
    Math.max(1, Number(url.searchParams.get("limit") ?? "90") || 90),
  );

  const days = await listStudentAttendanceDays(tenantId, studentId, {
    from,
    to,
    limit,
  });

  return NextResponse.json({
    studentId,
    timezone: "America/Sao_Paulo",
    days,
    today: toAttendanceDate(new Date()),
  });
}
