import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api/json";
import { getSession } from "@/lib/auth/session";
import {
  listDailyAttendance,
  toAttendanceDate,
} from "@/lib/services/attendance";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session || session.typ !== "tenant" || !session.tid) {
    return jsonError(401, "Não autenticado.");
  }
  const tenantId = session.tid;

  const url = new URL(request.url);
  const date =
    url.searchParams.get("date") ?? toAttendanceDate(new Date());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return jsonError(400, "Data inválida (use YYYY-MM-DD).");
  }

  const attendees = await listDailyAttendance(tenantId, date);

  return NextResponse.json({
    date,
    timezone: "America/Sao_Paulo",
    totalStudents: attendees.length,
    totalVisits: attendees.reduce((s, a) => s + a.visits, 0),
    attendees,
    /** Integração futura: mesmos registros vêm de access_events (catraca facial). */
    source: "access_events",
  });
}
