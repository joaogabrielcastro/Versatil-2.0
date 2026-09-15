import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AlertTriangle,
  CreditCard,
  DoorOpen,
  Package,
  TrendingUp,
  Users,
  type LucideIcon,
} from "lucide-react";
import { and, count, eq, gte, lte, sql } from "drizzle-orm";
import { AccessFeed } from "@/components/balcao/access-feed";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { getSession } from "@/lib/auth/session";
import { roleLabel } from "@/lib/labels";
import {
  accessEvents,
  invoices,
  products,
  students,
  tenants,
} from "@/lib/db/schema";
import { withTenantTransaction } from "@/lib/db/with-tenant";

export const dynamic = "force-dynamic";

function money(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export default async function BalcaoDashboardPage() {
  const session = await getSession();
  if (!session || session.typ !== "tenant" || !session.tid) {
    redirect("/login?next=/balcao");
  }

  const tenantId = session.tid;
  const now = new Date();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    tenant,
    tot,
    act,
    del,
    visitsToday,
    overdueCount,
    overdueCents,
    paidMonthCents,
    lowStockCount,
  ] = await withTenantTransaction(tenantId, async (tx) => {
    const [t] = await tx
      .select({ name: tenants.name, slug: tenants.slug })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);
        const [total] = await tx
      .select({ n: count() })
      .from(students)
      .where(eq(students.tenantId, tenantId));
    const [active] = await tx
      .select({ n: count() })
      .from(students)
      .where(and(eq(students.tenantId, tenantId), eq(students.status, "active")));
    const [delinquent] = await tx
      .select({ n: count() })
      .from(students)
      .where(
        and(eq(students.tenantId, tenantId), eq(students.status, "delinquent")),
      );
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
    const [overdue] = await tx
      .select({
        n: count(),
        cents: sql<number>`coalesce(sum(${invoices.amountCents}), 0)`,
      })
      .from(invoices)
      .where(
        and(
          eq(invoices.tenantId, tenantId),
          eq(invoices.status, "open"),
          lte(invoices.dueAt, now),
        ),
      );
    const [paidMonth] = await tx
      .select({
        cents: sql<number>`coalesce(sum(${invoices.amountCents}), 0)`,
      })
      .from(invoices)
      .where(
        and(
          eq(invoices.tenantId, tenantId),
          eq(invoices.status, "paid"),
          gte(invoices.paidAt, startOfMonth),
        ),
      );
    const [lowStock] = await tx
      .select({ n: count() })
      .from(products)
      .where(
        and(
          eq(products.tenantId, tenantId),
          eq(products.active, true),
          sql`${products.quantityOnHand} <= ${products.lowStockThreshold}`,
        ),
      );

    return [
      t,
      total?.n ?? 0,
      active?.n ?? 0,
      delinquent?.n ?? 0,
      visits?.n ?? 0,
      Number(overdue?.n ?? 0),
      Number(overdue?.cents ?? 0),
      Number(paidMonth?.cents ?? 0),
      Number(lowStock?.n ?? 0),
    ];
  });

  const tenantName = tenant?.name ?? "Academia";

  return (
    <main className="w-full px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <PageHeader
        eyebrow={tenantName}
        title="Painel do balcão"
        description={`${roleLabel(session.role)} · visão geral da operação`}
      />

      <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-4">
        <StatCard label="Alunos cadastrados" value={tot} icon={Users} />
        <StatCard label="Ativos" value={act} accent="emerald" icon={TrendingUp} />
        <StatCard label="Inadimplentes" value={del} accent="red" icon={AlertTriangle} />
        <StatCard label="Entradas hoje" value={visitsToday} icon={DoorOpen} />
      </section>

      <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-muted-foreground">Recebido no mês</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-emerald-700">
                  {money(paidMonthCents)}
                </p>
              </div>
              <div className="flex size-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                <CreditCard className="size-4" aria-hidden />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className={overdueCount > 0 ? "border-red-200" : undefined}>
          <CardContent className="pt-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-muted-foreground">Faturas vencidas em aberto</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-red-700">
                  {money(overdueCents)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {overdueCount} fatura(s) —{" "}
                  <Link
                    href="/balcao/cobranca"
                    className="font-medium text-primary underline-offset-2 hover:underline"
                  >
                    ver cobrança
                  </Link>
                </p>
              </div>
              <div className="flex size-9 items-center justify-center rounded-lg bg-red-50 text-red-700">
                <AlertTriangle className="size-4" aria-hidden />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className={lowStockCount > 0 ? "border-amber-200" : undefined}>
          <CardContent className="pt-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-muted-foreground">Estoque baixo</p>
                <p
                  className={`mt-1 text-2xl font-semibold tabular-nums ${
                    lowStockCount > 0 ? "text-amber-700" : "text-foreground"
                  }`}
                >
                  {lowStockCount}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  produto(s) no limite —{" "}
                  <Link
                    href="/balcao/estoque"
                    className="font-medium text-primary underline-offset-2 hover:underline"
                  >
                    ver estoque
                  </Link>
                </p>
              </div>
              <div className="flex size-9 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
                <Package className="size-4" aria-hidden />
              </div>
            </div>
          </CardContent>
        </Card>
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
  icon: Icon,
}: {
  label: string;
  value: number;
  accent?: "emerald" | "red";
  icon: LucideIcon;
}) {
  const valueClass =
    accent === "emerald"
      ? "text-emerald-700"
      : accent === "red"
        ? "text-red-700"
        : "text-foreground";
  const iconBg =
    accent === "emerald"
      ? "bg-emerald-50 text-emerald-700"
      : accent === "red"
        ? "bg-red-50 text-red-700"
        : "bg-primary/10 text-primary";

  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardContent className="pt-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className={`mt-1 text-2xl font-semibold tabular-nums ${valueClass}`}>
              {value}
            </p>
          </div>
          <div
            className={`flex size-9 items-center justify-center rounded-lg ${iconBg}`}
          >
            <Icon className="size-4" aria-hidden />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
