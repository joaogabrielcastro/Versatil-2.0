import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api/json";
import { getSession } from "@/lib/auth/session";
import { parseReportDateRange } from "@/lib/reports/date-range";
import { buildAttendancePeriodReport } from "@/lib/services/reports/attendance";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session || session.typ !== "tenant" || !session.tid) {
    return jsonError(401, "Não autenticado.");
  }

  const url = new URL(request.url);
  const parsed = parseReportDateRange(
    url.searchParams.get("from"),
    url.searchParams.get("to"),
  );
  if ("error" in parsed) {
    return jsonError(400, parsed.error);
  }

  const report = await buildAttendancePeriodReport(session.tid, parsed);
  return NextResponse.json(report);
}
