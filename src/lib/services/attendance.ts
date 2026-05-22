import "server-only";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { accessEvents, students } from "@/lib/db/schema";
import { withTenantTransaction } from "@/lib/db/with-tenant";

const TZ = "America/Sao_Paulo";

/** Data civil no fuso da academia (YYYY-MM-DD). */
export function toAttendanceDate(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: TZ });
}

export function parseAttendanceDate(dateStr: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  const start = new Date(`${dateStr}T00:00:00-03:00`);
  return Number.isNaN(start.getTime()) ? null : start;
}

export function dayRangeUtc(dateStr: string): { from: Date; to: Date } | null {
  const start = parseAttendanceDate(dateStr);
  if (!start) return null;
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { from: start, to: end };
}

export type AttendanceDay = {
  date: string;
  visits: number;
  sources: string[];
  lastAt: string;
};

/** Dias em que o aluno teve acesso permitido na catraca (facial). */
export async function listStudentAttendanceDays(
  tenantId: string,
  studentId: string,
  opts?: { from?: string; to?: string; limit?: number },
): Promise<AttendanceDay[]> {
  const limit = opts?.limit ?? 90;
  const fromDate = opts?.from ? parseAttendanceDate(opts.from) : null;
  const toDate = opts?.to ? parseAttendanceDate(opts.to) : null;
  const toEnd =
    toDate != null
      ? (() => {
          const e = new Date(toDate);
          e.setDate(e.getDate() + 1);
          return e;
        })()
      : null;

  return withTenantTransaction(tenantId, async (tx) => {
    const conditions = [
      eq(accessEvents.tenantId, tenantId),
      eq(accessEvents.studentId, studentId),
      eq(accessEvents.allowed, true),
    ];
    if (fromDate) conditions.push(gte(accessEvents.createdAt, fromDate));
    if (toEnd) conditions.push(lte(accessEvents.createdAt, toEnd));

    const rows = await tx
      .select({
        createdAt: accessEvents.createdAt,
        reason: accessEvents.reason,
      })
      .from(accessEvents)
      .where(and(...conditions))
      .orderBy(desc(accessEvents.createdAt))
      .limit(2000);

    const byDay = new Map<string, { visits: number; sources: Set<string>; lastAt: Date }>();

    for (const row of rows) {
      const date = toAttendanceDate(row.createdAt);
      const source = row.reason && row.reason !== "manual_reception" ? row.reason : "catraca";
      let bucket = byDay.get(date);
      if (!bucket) {
        bucket = { visits: 0, sources: new Set(), lastAt: row.createdAt };
        byDay.set(date, bucket);
      }
      bucket.visits += 1;
      bucket.sources.add(source);
      if (row.createdAt > bucket.lastAt) bucket.lastAt = row.createdAt;
    }

    return [...byDay.entries()]
      .map(([date, b]) => ({
        date,
        visits: b.visits,
        sources: [...b.sources],
        lastAt: b.lastAt.toISOString(),
      }))
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, limit);
  });
}

export type DailyAttendanceRow = {
  studentId: string;
  fullName: string;
  visits: number;
  lastAt: string;
};

/** Quem passou na academia num dia (acessos permitidos). */
export async function listDailyAttendance(
  tenantId: string,
  dateStr: string,
): Promise<DailyAttendanceRow[]> {
  const range = dayRangeUtc(dateStr);
  if (!range) return [];

  return withTenantTransaction(tenantId, async (tx) => {
    const rows = await tx
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
          gte(accessEvents.createdAt, range.from),
          lte(accessEvents.createdAt, range.to),
        ),
      )
      .orderBy(desc(accessEvents.createdAt));

    const byStudent = new Map<
      string,
      { fullName: string; visits: number; lastAt: Date }
    >();

    for (const row of rows) {
      if (!row.studentId) continue;
      let bucket = byStudent.get(row.studentId);
      if (!bucket) {
        bucket = { fullName: row.fullName, visits: 0, lastAt: row.createdAt };
        byStudent.set(row.studentId, bucket);
      }
      bucket.visits += 1;
      if (row.createdAt > bucket.lastAt) bucket.lastAt = row.createdAt;
    }

    return [...byStudent.entries()]
      .map(([studentId, b]) => ({
        studentId,
        fullName: b.fullName,
        visits: b.visits,
        lastAt: b.lastAt.toISOString(),
      }))
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
  });
}
