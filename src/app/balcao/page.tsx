import Link from "next/link";
import { redirect } from "next/navigation";
import { and, count, eq, sql } from "drizzle-orm";
import { AccessFeed } from "@/components/balcao/access-feed";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { getSession } from "@/lib/auth/session";
import { products, tenants } from "@/lib/db/schema";
import { withTenantTransaction } from "@/lib/db/with-tenant";
import { roleLabel } from "@/lib/labels";
import {
  DASHBOARD_DEFINITIONS as DEF,
  buildDashboardMetrics,
  type MonthPoint,
} from "@/lib/services/dashboard/metrics";

export const dynamic = "force-dynamic";

function money(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function monthLabel(key: string) {
  const [y, m] = key.split("-");
  return `${MONTHS[Number(m) - 1]}/${y!.slice(2)}`;
}

function pct(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 100) : null;
}

export default async function BalcaoDashboardPage() {
  const session = await getSession();
  if (!session || session.typ !== "tenant" || !session.tid) {
    redirect("/login?next=/balcao");
  }
  const tenantId = session.tid;

  const { tenantName, metrics, lowStock } = await withTenantTransaction(tenantId, async (tx) => {
    const [t] = await tx
      .select({ name: tenants.name })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);
    const [low] = await tx
      .select({ n: count() })
      .from(products)
      .where(
        and(
          eq(products.tenantId, tenantId),
          eq(products.active, true),
          sql`${products.quantityOnHand} <= ${products.lowStockThreshold}`,
        ),
      );
    return {
      tenantName: t?.name ?? "Academia",
      metrics: await buildDashboardMetrics(tx, tenantId),
      lowStock: Number(low?.n ?? 0),
    };
  });

  const m = metrics;
  const receivedPct = pct(m.month.receivedCents, m.month.billedCents);

  return (
    <main className="w-full px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <PageHeader
        eyebrow={tenantName}
        title="Painel"
        description={`${roleLabel(session.role)} · visão da operação`}
      />

      {m.overdue.invoices > 0 || lowStock > 0 ? (
        <div className="mt-6 flex flex-col gap-2">
          {m.overdue.invoices > 0 ? (
            <Attention href="/balcao/cobranca" linkLabel="Ver cobrança">
              {m.overdue.students} aluno(s) com {money(m.overdue.cents)} em atraso (
              {m.overdue.invoices} fatura(s)).
            </Attention>
          ) : null}
          {lowStock > 0 ? (
            <Attention href="/balcao/estoque" linkLabel="Ver estoque">
              {lowStock} produto(s) no limite de estoque.
            </Attention>
          ) : null}
        </div>
      ) : null}

      <Section title="Hoje" columns={3}>
        <Stat label="Entradas" value={String(m.today.entries)} hint="alunos liberados" def={DEF.entriesToday} />
        <Stat label="Bloqueios" value={String(m.today.blocked)} hint="alunos barrados" def={DEF.blockedToday} />
        <Stat
          label="Em atraso"
          value={money(m.overdue.cents)}
          hint={`${m.overdue.students} aluno(s)`}
          def={DEF.overdue}
          tone={m.overdue.cents > 0 ? "alert" : undefined}
        />
      </Section>

      <Section title="Mês atual">
        <Stat label="Faturado" value={money(m.month.billedCents)} hint="vencimentos do mês" def={DEF.billed} />
        <Stat
          label="Recebido"
          value={money(m.month.receivedCents)}
          hint={receivedPct === null ? "sem faturamento no mês" : `${receivedPct}% do faturado`}
          def={DEF.received}
        />
        <Stat label="Novas matrículas" value={String(m.month.newSubscriptions)} def={DEF.newSubscriptions} />
        <Stat label="Cancelamentos" value={String(m.month.cancellations)} def={DEF.cancellations} />
      </Section>

      <Section title="Base de alunos" columns={3}>
        <Stat
          label="Ativos"
          value={String(m.students.active)}
          hint={`de ${m.students.total} cadastrados`}
          def={DEF.active}
        />
        <Stat
          label="Inadimplentes"
          value={String(m.students.delinquent)}
          hint="com fatura vencida"
          tone={m.students.delinquent > 0 ? "alert" : undefined}
        />
        <Stat
          label="Frequência"
          value={m.frequency30d.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}
          hint="dias por aluno ativo (30 dias)"
          def={DEF.frequency}
        />
      </Section>

      <section className="mt-10">
        <h2 className="text-base font-medium">Últimos 6 meses</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Faturado é o que venceu no mês; recebido é o que foi pago no mês (pode incluir atrasados).
        </p>
        <HistoryTable history={m.history} />
      </section>

      <section className="mt-10">
        <h2 className="text-base font-medium">Acessos na catraca</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Últimas tentativas — atualização automática a cada poucos segundos.
        </p>
        <div className="mt-4">
          <AccessFeed />
        </div>
      </section>

      <details className="mt-10 text-sm text-muted-foreground">
        <summary className="cursor-pointer font-medium text-foreground">Como os números são calculados</summary>
        <dl className="mt-3 grid gap-2 sm:grid-cols-2">
          {(
            [
              ["Ativos", DEF.active],
              ["Entradas", DEF.entriesToday],
              ["Bloqueios", DEF.blockedToday],
              ["Faturado", DEF.billed],
              ["Recebido", DEF.received],
              ["Em atraso", DEF.overdue],
              ["Novas matrículas", DEF.newSubscriptions],
              ["Cancelamentos", DEF.cancellations],
              ["Frequência", DEF.frequency],
            ] as const
          ).map(([term, text]) => (
            <div key={term}>
              <dt className="font-medium text-foreground">{term}</dt>
              <dd>{text}</dd>
            </div>
          ))}
        </dl>
      </details>
    </main>
  );
}

function Section({
  title,
  columns = 4,
  children,
}: {
  title: string;
  columns?: 3 | 4;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
      <div
        className={`mt-3 grid grid-cols-2 gap-3 ${columns === 3 ? "lg:grid-cols-3" : "lg:grid-cols-4"}`}
      >
        {children}
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  hint,
  def,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  def?: string;
  tone?: "alert";
}) {
  return (
    <Card title={def}>
      <CardContent className="pt-4 pb-4">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p
          className={`mt-1 text-lg font-semibold tabular-nums sm:text-2xl ${
            tone === "alert" ? "text-stop" : "text-foreground"
          }`}
        >
          {value}
        </p>
        {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

function Attention({
  href,
  linkLabel,
  children,
}: {
  href: string;
  linkLabel: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-warn/40 bg-warn-soft px-4 py-2.5 text-sm text-warn">
      <span>
        <span aria-hidden>⚠ </span>
        <span className="sr-only">Atenção: </span>
        {children}
      </span>
      <Link href={href} className="font-medium underline underline-offset-2">
        {linkLabel}
      </Link>
    </div>
  );
}

function HistoryTable({ history }: { history: MonthPoint[] }) {
  return (
    <div className="mt-4 overflow-x-auto rounded-lg border border-border bg-card">
      <table className="w-full min-w-[560px] text-sm">
        <thead className="text-left text-xs text-muted-foreground">
          <tr className="border-b border-border">
            <th className="px-4 py-2 font-medium">Mês</th>
            <th className="px-4 py-2 text-right font-medium">Faturado</th>
            <th className="px-4 py-2 text-right font-medium">Recebido</th>
            <th className="w-40 px-4 py-2 font-medium">Recebido / faturado</th>
            <th className="px-4 py-2 text-right font-medium">Matrículas</th>
            <th className="px-4 py-2 text-right font-medium">Cancelamentos</th>
          </tr>
        </thead>
        <tbody>
          {history.map((p) => {
            const ratio = pct(p.receivedCents, p.billedCents);
            return (
              <tr key={p.month} className="border-b border-border last:border-0">
                <td className="px-4 py-2">{monthLabel(p.month)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{money(p.billedCents)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{money(p.receivedCents)}</td>
                <td className="px-4 py-2">
                  {ratio === null ? (
                    <span className="text-xs text-muted-foreground">—</span>
                  ) : (
                    <div className="flex items-center gap-2">
                      <div
                        className="h-1.5 flex-1 rounded-full bg-muted"
                        role="img"
                        aria-label={`${ratio}% recebido`}
                      >
                        <div
                          className="h-full rounded-full bg-foreground/60"
                          style={{ width: `${Math.min(ratio, 100)}%` }}
                        />
                      </div>
                      <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">
                        {ratio}%
                      </span>
                    </div>
                  )}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">{p.newSubscriptions}</td>
                <td className="px-4 py-2 text-right tabular-nums">{p.cancellations}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
