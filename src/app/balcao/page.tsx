import Link from "next/link";
import { redirect } from "next/navigation";
import { count, eq } from "drizzle-orm";
import { AccessFeed } from "@/components/balcao/access-feed";
import { LogoutButton } from "@/components/logout-button";
import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/auth/session";
import { students } from "@/lib/db/schema";
import { withTenantTransaction } from "@/lib/db/with-tenant";

export const dynamic = "force-dynamic";

export default async function BalcaoDashboardPage() {
  const session = await getSession();
  if (!session || session.typ !== "tenant" || !session.tid) {
    redirect("/login?next=/balcao");
  }

  const tenantId = session.tid;

  const [tot, act] = await withTenantTransaction(tenantId, async (tx) => {
    const [t] = await tx.select({ n: count() }).from(students);
    const [a] = await tx
      .select({ n: count() })
      .from(students)
      .where(eq(students.status, "active"));
    return [t?.n ?? 0, a?.n ?? 0];
  });

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-6">
        <div>
          <p className="text-sm text-muted-foreground">Recepção</p>
          <h1 className="text-2xl font-semibold tracking-tight">Balcão</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Logado como <span className="font-medium">{session.role}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/balcao/alunos">Alunos</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href="/">Início</Link>
          </Button>
          <LogoutButton />
        </div>
      </header>

      <section className="mt-8 grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-border p-4">
          <p className="text-sm text-muted-foreground">Alunos</p>
          <p className="text-2xl font-semibold">{tot}</p>
        </div>
        <div className="rounded-lg border border-border p-4">
          <p className="text-sm text-muted-foreground">Ativos</p>
          <p className="text-2xl font-semibold">{act}</p>
        </div>
        <div className="rounded-lg border border-border p-4">
          <p className="text-sm text-muted-foreground">Atalhos</p>
          <div className="mt-2 flex flex-col gap-2 text-sm">
            <Link className="underline underline-offset-4" href="/balcao/alunos">
              Buscar / cadastrar
            </Link>
            <Link className="underline underline-offset-4" href="/balcao/importar">
              Importar CSV
            </Link>
          </div>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-medium">Acessos (tempo real)</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Atualização a cada poucos segundos (polling).
        </p>
        <div className="mt-4">
          <AccessFeed />
        </div>
      </section>
    </main>
  );
}
