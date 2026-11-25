import { sql } from "drizzle-orm";
import { dueBeforeToday } from "@/lib/billing/due-day-sql";
import { toIsoDateInTz } from "@/lib/dates/br";
import { accessEvents, invoices, students, studentSubscriptions } from "@/lib/db/schema";
import type { DbTransaction } from "@/lib/db/with-tenant";
import { countStudentsByEffectiveStatus } from "@/lib/services/student-effective-status";

/**
 * Indicadores do painel. Todos calculados no banco, no calendário de São Paulo.
 * As definições exibidas ao usuário ficam em DASHBOARD_DEFINITIONS.
 */

const TZ = "America/Sao_Paulo";

export const DASHBOARD_DEFINITIONS = {
  active:
    "Alunos com matrícula vigente e sem fatura bloqueante vencida em aberto (a mesma regra da catraca).",
  entriesToday: "Alunos diferentes liberados na catraca hoje. Várias passagens do mesmo aluno contam uma vez.",
  blockedToday: "Alunos diferentes barrados na catraca hoje (inadimplentes, sem plano ou não encontrados).",
  newSubscriptions: "Matrículas criadas no mês corrente.",
  cancellations: "Pedidos de cancelamento registrados no mês corrente (a saída pode ser em data futura).",
  billed: "Soma das faturas com vencimento no mês, exceto canceladas. É o que deveria entrar.",
  received:
    "Soma das faturas quitadas no mês (balcão ou Stone). É o que entrou. Vendas da loja não entram aqui.",
  overdue: "Faturas em aberto com vencimento antes de hoje que bloqueiam ou não a catraca.",
  frequency: "Média de dias com entrada liberada por aluno ativo nos últimos 30 dias.",
} as const;

export type MonthPoint = {
  month: string; // YYYY-MM
  billedCents: number;
  receivedCents: number;
  newSubscriptions: number;
  cancellations: number;
};

export type DashboardMetrics = {
  students: { active: number; delinquent: number; inactive: number; total: number };
  today: { entries: number; blocked: number };
  month: {
    newSubscriptions: number;
    cancellations: number;
    billedCents: number;
    receivedCents: number;
  };
  overdue: { cents: number; invoices: number; students: number };
  frequency30d: number;
  history: MonthPoint[];
};

/** "YYYY-MM" do mês civil em São Paulo, deslocado em `offset` meses. */
function monthKey(now: Date, offset: number): string {
  const [y, m] = toIsoDateInTz(now).split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + offset, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Expressão SQL: mês civil (YYYY-MM) de um timestamp em São Paulo. */
function monthOf(column: unknown) {
  return sql`to_char(${column} AT TIME ZONE ${TZ}, 'YYYY-MM')`;
}

function num(v: unknown): number {
  return Number(v ?? 0);
}

export async function buildDashboardMetrics(
  tx: DbTransaction,
  tenantId: string,
  now = new Date(),
): Promise<DashboardMetrics> {
  const today = toIsoDateInTz(now);
  const currentMonth = monthKey(now, 0);
  const firstMonth = monthKey(now, -5);

  const status = await countStudentsByEffectiveStatus(tx, tenantId, now);

  const [todayRow] = await tx
    .select({
      entries: sql<number>`count(distinct ${accessEvents.studentId}) filter (where ${accessEvents.allowed})`,
      blocked: sql<number>`count(distinct coalesce(${accessEvents.studentId}::text, ${accessEvents.id}::text)) filter (where not ${accessEvents.allowed})`,
    })
    .from(accessEvents)
    .where(
      sql`${accessEvents.tenantId} = ${tenantId}
        AND (${accessEvents.createdAt} AT TIME ZONE ${TZ})::date = ${today}::date`,
    );

  const [overdueRow] = await tx
    .select({
      cents: sql<number>`coalesce(sum(${invoices.amountCents}), 0)`,
      invoices: sql<number>`count(*)`,
      students: sql<number>`count(distinct ${invoices.studentId})`,
    })
    .from(invoices)
    .where(
      sql`${invoices.tenantId} = ${tenantId} AND ${invoices.status} = 'open' AND ${dueBeforeToday(invoices.dueAt, now)}`,
    );

  const billedRows = await tx
    .select({
      month: sql<string>`${monthOf(invoices.dueAt)}`,
      cents: sql<number>`coalesce(sum(${invoices.amountCents}), 0)`,
    })
    .from(invoices)
    .where(
      sql`${invoices.tenantId} = ${tenantId}
        AND ${invoices.status} <> 'void'
        AND ${monthOf(invoices.dueAt)} BETWEEN ${firstMonth} AND ${currentMonth}`,
    )
    .groupBy(sql`1`);

  const receivedRows = await tx
    .select({
      month: sql<string>`${monthOf(invoices.paidAt)}`,
      cents: sql<number>`coalesce(sum(${invoices.amountCents}), 0)`,
    })
    .from(invoices)
    .where(
      sql`${invoices.tenantId} = ${tenantId}
        AND ${invoices.status} = 'paid'
        AND ${invoices.paidAt} IS NOT NULL
        AND ${monthOf(invoices.paidAt)} BETWEEN ${firstMonth} AND ${currentMonth}`,
    )
    .groupBy(sql`1`);

  const newSubRows = await tx
    .select({
      month: sql<string>`${monthOf(studentSubscriptions.createdAt)}`,
      n: sql<number>`count(*)`,
    })
    .from(studentSubscriptions)
    .where(
      sql`${studentSubscriptions.tenantId} = ${tenantId}
        AND ${monthOf(studentSubscriptions.createdAt)} BETWEEN ${firstMonth} AND ${currentMonth}`,
    )
    .groupBy(sql`1`);

  const cancelRows = await tx
    .select({
      month: sql<string>`${monthOf(studentSubscriptions.cancelRequestedAt)}`,
      n: sql<number>`count(*)`,
    })
    .from(studentSubscriptions)
    .where(
      sql`${studentSubscriptions.tenantId} = ${tenantId}
        AND ${studentSubscriptions.cancelRequestedAt} IS NOT NULL
        AND ${monthOf(studentSubscriptions.cancelRequestedAt)} BETWEEN ${firstMonth} AND ${currentMonth}`,
    )
    .groupBy(sql`1`);

  const [visitRow] = await tx
    .select({
      studentDays: sql<number>`count(distinct (${accessEvents.studentId}, (${accessEvents.createdAt} AT TIME ZONE ${TZ})::date))`,
    })
    .from(accessEvents)
    .where(
      sql`${accessEvents.tenantId} = ${tenantId}
        AND ${accessEvents.allowed}
        AND ${accessEvents.studentId} IS NOT NULL
        AND (${accessEvents.createdAt} AT TIME ZONE ${TZ})::date > (${today}::date - 30)`,
    );

  const [totalRow] = await tx
    .select({ n: sql<number>`count(*)` })
    .from(students)
    .where(sql`${students.tenantId} = ${tenantId} AND ${students.anonymizedAt} IS NULL`);

  const byMonth = (rows: { month: string; cents?: number; n?: number }[], key: "cents" | "n") =>
    new Map(rows.map((r) => [r.month, num(r[key])]));
  const billed = byMonth(billedRows, "cents");
  const received = byMonth(receivedRows, "cents");
  const newSubs = byMonth(newSubRows, "n");
  const cancels = byMonth(cancelRows, "n");

  const history: MonthPoint[] = [];
  for (let offset = -5; offset <= 0; offset++) {
    const month = monthKey(now, offset);
    history.push({
      month,
      billedCents: billed.get(month) ?? 0,
      receivedCents: received.get(month) ?? 0,
      newSubscriptions: newSubs.get(month) ?? 0,
      cancellations: cancels.get(month) ?? 0,
    });
  }
  const current = history[history.length - 1]!;

  return {
    students: {
      active: status.active,
      delinquent: status.delinquent,
      inactive: status.inactive,
      total: num(totalRow?.n),
    },
    today: { entries: num(todayRow?.entries), blocked: num(todayRow?.blocked) },
    month: {
      newSubscriptions: current.newSubscriptions,
      cancellations: current.cancellations,
      billedCents: current.billedCents,
      receivedCents: current.receivedCents,
    },
    overdue: {
      cents: num(overdueRow?.cents),
      invoices: num(overdueRow?.invoices),
      students: num(overdueRow?.students),
    },
    frequency30d: status.active > 0 ? num(visitRow?.studentDays) / status.active : 0,
    history,
  };
}
