import "server-only";
import { and, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { accessEvents, students } from "@/lib/db/schema";
import { eachDayInRange, type ReportDateRange } from "@/lib/reports/date-range";
import { toAttendanceDate } from "@/lib/services/attendance";
import { withTenantTransaction } from "@/lib/db/with-tenant";

export type AttendancePeriodReport = {
  from: string;
  to: string;
  summary: {
    totalVisits: number;
    uniqueStudents: number;
    daysWithVisits: number;
    avgVisitsPerDay: number;
  };
  daily: { date: string; uniqueStudents: number; visits: number }[];
  topStudents: {
    studentId: string;
    fullName: string;
    visits: number;
  }[];
  absentActive: {
    studentId: string;
    fullName: string;
    lastVisitAt: string | null;
  }[];
};

export async function buildAttendancePeriodReport(
  tenantId: string,
  range: ReportDateRange,
): Promise<AttendancePeriodReport> {
  return withTenantTransaction(tenantId, async (tx) => {
    const eventRows = await tx
      .select({
        studentId: accessEvents.studentId,
        fullName: students.fullName,
        createdAt: accessEvents.createdAt,
      })
      .from(accessEvents)
      .innerJoin(students, eq(students.id, accessEvents.studentId))
      .where(
        and(
          eq(accessEvents.tenantId, tenantId),
          eq(accessEvents.allowed, true),
          gte(accessEvents.createdAt, range.fromUtc),
          lt(accessEvents.createdAt, range.toExclusiveUtc),
        ),
      );

    const byDay = new Map<string, { students: Set<string>; visits: number }>();
    const byStudent = new Map<
      string,
      { fullName: string; visits: number; lastAt: Date }
    >();

    for (const row of eventRows) {
      if (!row.studentId) continue;
      const date = toAttendanceDate(row.createdAt);
      let day = byDay.get(date);
      if (!day) {
        day = { students: new Set(), visits: 0 };
        byDay.set(date, day);
      }
      day.students.add(row.studentId);
      day.visits += 1;

      let st = byStudent.get(row.studentId);
      if (!st) {
        st = { fullName: row.fullName, visits: 0, lastAt: row.createdAt };
        byStudent.set(row.studentId, st);
      }
      st.visits += 1;
      if (row.createdAt > st.lastAt) st.lastAt = row.createdAt;
    }

    const allDays = eachDayInRange(range.from, range.to);
    const daily = allDays.map((date) => {
      const b = byDay.get(date);
      return {
        date,
        uniqueStudents: b?.students.size ?? 0,
        visits: b?.visits ?? 0,
      };
    });

    const daysWithVisits = daily.filter((d) => d.visits > 0).length;
    const totalVisits = daily.reduce((s, d) => s + d.visits, 0);
    const uniqueStudents = byStudent.size;
    const avgVisitsPerDay =
      daysWithVisits > 0 ? Math.round((totalVisits / daysWithVisits) * 10) / 10 : 0;

    const topStudents = [...byStudent.entries()]
      .map(([studentId, b]) => ({
        studentId,
        fullName: b.fullName,
        visits: b.visits,
      }))
      .sort((a, b) => b.visits - a.visits || a.fullName.localeCompare(b.fullName))
      .slice(0, 25);

    const activeRows = await tx
      .select({ id: students.id, fullName: students.fullName })
      .from(students)
      .where(
        and(eq(students.tenantId, tenantId), eq(students.status, "active")),
      );

    const presentIds = new Set(byStudent.keys());
    const absentIds = activeRows
      .filter((s) => !presentIds.has(s.id))
      .map((s) => s.id);

    const lastVisitByStudent = new Map<string, Date>();
    if (absentIds.length > 0) {
      const lastRows = await tx
        .select({
          studentId: accessEvents.studentId,
          lastAt: sql<Date>`max(${accessEvents.createdAt})`.as("last_at"),
        })
        .from(accessEvents)
        .where(
          and(
            eq(accessEvents.tenantId, tenantId),
            eq(accessEvents.allowed, true),
            inArray(accessEvents.studentId, absentIds),
          ),
        )
        .groupBy(accessEvents.studentId);

      for (const row of lastRows) {
        if (row.studentId && row.lastAt) {
          lastVisitByStudent.set(row.studentId, row.lastAt);
        }
      }
    }

    const absentActive = activeRows
      .filter((s) => !presentIds.has(s.id))
      .map((s) => ({
        studentId: s.id,
        fullName: s.fullName,
        lastVisitAt: lastVisitByStudent.get(s.id)?.toISOString() ?? null,
      }))
      .sort((a, b) => a.fullName.localeCompare(b.fullName));

    return {
      from: range.from,
      to: range.to,
      summary: {
        totalVisits,
        uniqueStudents,
        daysWithVisits,
        avgVisitsPerDay,
      },
      daily,
      topStudents,
      absentActive,
    };
  });
}
