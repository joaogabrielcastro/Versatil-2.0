import Link from "next/link";
import { redirect } from "next/navigation";
import { count, eq, gte, and } from "drizzle-orm";
import { AccessFeed } from "@/components/balcao/access-feed";
import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/auth/session";
import { roleLabel } from "@/lib/labels";
import { accessEvents, students, tenants } from "@/lib/db/schema";
import { withTenantTransaction } from "@/lib/db/with-tenant";

export const dynamic = "force-dynamic";

export default async function BalcaoDashboardPage() {
  const session = await getSession();
  if (!session || session.typ !== "tenant" || !session.tid) {
    redirect("/login?next=/balcao");
  }

  const tenantId = session.tid;
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [tenant, tot, act, del, visitsToday] = await withTenantTransaction(
    tenantId,
    async (tx) => {
      const [t] = await tx
        .select({ name: tenants.name })
        .from(tenants)
        .where(eq(tenants.id, tenantId))
        .limit(1);
      const [total] = await tx.select({ n: count() }).from(students);
      const [active] = await tx
        .select({ n: count() })
        .from(students)
        .where(eq(students.status, "active"));
      const [delinquent] = await tx
        .select({ n: count() })
        .from(students)
        .where(eq(students.status, "delinquent"));
      const [visits] = await tx
        .select({ n: count() })
        .from(accessEvents)
        .where(
          and(
            eq(accessEvents.tenantId, tenantId),
            eq(accessEvents.allowed, true),
            gte(accessEvents.createdAt, startOfDay),
          ),
        );
      return [
        t?.name ?? "Academia",
        total?.n ?? 0,
        active?.n ?? 0,
        delinquent?.n ?? 0,
        visits?.n ?? 0,
      ];
    },
  );

  const shortcuts = [
    { href: "/balcao/alunos", label: "Alunos" },
    { href: "/balcao/cobranca", label: "Cobrança" },
    { href: "/balcao/presenca", label: "Presença" },
    { href: "/balcao/treinos", label: "Treinos" },
    { href: "/balcao/relatorios", label: "Relatórios" },
    { href: "/imprimir-treino?slug=demo", label: "Terminal aluno" },
  ];

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="border-b border-border pb-6">
        <p className="text-sm font-medium text-primary">{tenant}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Painel do balcão</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {roleLabel(session.role)} · visão geral da operação
        </p>
      </header>

      <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Alunos cadastrados" value={tot} />
        <StatCard label="Ativos" value={act} accent="emerald" />
        <StatCard label="Inadimplentes" value={del} accent="red" />
        <StatCard label="Entradas hoje" value={visitsToday} />
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-medium text-muted-foreground">Atalhos</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {shortcuts.map((s) => (
            <Button key={s.href} variant="outline" size="sm" asChild>
              <Link href={s.href}>{s.label}</Link>
            </Button>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-medium">Acessos na catraca</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Últimas entradas — atualização automática a cada poucos segundos.
        </p>
        <div className="mt-4">
          <AccessFeed />
        </div>
      </section>
    </main>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: "emerald" | "red";
}) {
  const valueClass =
    accent === "emerald"
      ? "text-emerald-700"
      : accent === "red"
        ? "text-red-700"
        : "text-foreground";
  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${valueClass}`}>
        {value}
      </p>
    </div>
  );
}
