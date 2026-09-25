import { and, count, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { toIsoDateInTz } from "@/lib/dates/br";
import { students } from "@/lib/db/schema";
import type { DbTransaction } from "@/lib/db/with-tenant";
import type { StudentComputedStatus } from "@/lib/services/student-status-logic";

/**
 * Situação lida na hora, com a mesma regra do recálculo e da catraca.
 * Inadimplente é fatura vencida ou incobrável. Ativo exige contrato vigente
 * e nenhuma dessas pendências. Sem contrato vigente permanece inativo,
 * mesmo sem dívida. A virada do dia entra na data civil, sem gravar status.
 */
export function effectiveStudentStatusSql(now = new Date()): SQL<StudentComputedStatus> {
  const today = toIsoDateInTz(now);
  const instant = now.toISOString();
  return sql<StudentComputedStatus>`(
    CASE
      WHEN EXISTS (
        SELECT 1 FROM invoices AS inv
        WHERE inv.tenant_id = students.tenant_id
          AND inv.student_id = students.id
          AND (
            (
              inv.status = 'open'
              AND (inv.due_at AT TIME ZONE 'America/Sao_Paulo')::date < ${today}::date
            )
            OR inv.status = 'uncollectible'
          )
      ) THEN 'delinquent'
      WHEN EXISTS (
        SELECT 1 FROM student_subscriptions AS sub
        WHERE sub.tenant_id = students.tenant_id
          AND sub.student_id = students.id
          AND sub.active = true
          AND sub.starts_at <= ${instant}::timestamptz
          AND (sub.ends_at IS NULL OR sub.ends_at >= ${instant}::timestamptz)
      ) OR EXISTS (
        SELECT 1 FROM subscription_terms AS term
        INNER JOIN student_subscriptions AS renewed
          ON term.subscription_id = renewed.id
        WHERE term.tenant_id = students.tenant_id
          AND renewed.student_id = students.id
          AND term.source = 'renewal'
          AND term.starts_at <= ${instant}::timestamptz
          AND (term.ends_at IS NULL OR term.ends_at >= ${instant}::timestamptz)
      ) THEN 'active'
      ELSE 'inactive'
    END
  )`;
}

export async function countStudentsByEffectiveStatus(
  tx: DbTransaction,
  tenantId: string,
  now = new Date(),
): Promise<Record<StudentComputedStatus, number>> {
  const statusSql = effectiveStudentStatusSql(now);
  const [row] = await tx
    .select({
      active: sql<number>`count(*) filter (where ${statusSql} = 'active')`,
      delinquent: sql<number>`count(*) filter (where ${statusSql} = 'delinquent')`,
      inactive: sql<number>`count(*) filter (where ${statusSql} = 'inactive')`,
    })
    .from(students)
    .where(eq(students.tenantId, tenantId));

  return {
    active: Number(row?.active ?? 0),
    delinquent: Number(row?.delinquent ?? 0),
    inactive: Number(row?.inactive ?? 0),
  };
}

export async function listStudentsPage(
  tx: DbTransaction,
  tenantId: string,
  input: {
    q?: string | null;
    status?: StudentComputedStatus | null;
    limit: number;
    offset: number;
    now?: Date;
  },
) {
  const now = input.now ?? new Date();
  const statusSql = effectiveStudentStatusSql(now);
  const filters: SQL[] = [eq(students.tenantId, tenantId)];
  if (input.status) filters.push(sql`${statusSql} = ${input.status}`);
  const pattern = input.q?.trim() ? `%${input.q.trim()}%` : null;
  if (pattern) {
    filters.push(
      or(
        ilike(students.fullName, pattern),
        ilike(students.cpf, pattern),
        ilike(students.email, pattern),
      )!,
    );
  }
  const whereExpr = and(...filters);

  const [items, [{ total }]] = await Promise.all([
    tx
      .select({
        id: students.id,
        fullName: students.fullName,
        cpf: students.cpf,
        email: students.email,
        whatsapp: students.whatsapp,
        birthDate: students.birthDate,
        status: statusSql,
        createdAt: students.createdAt,
      })
      .from(students)
      .where(whereExpr)
      .orderBy(desc(students.createdAt))
      .limit(input.limit)
      .offset(input.offset),
    tx.select({ total: count() }).from(students).where(whereExpr),
  ]);

  return { items, total: Number(total ?? 0) };
}
