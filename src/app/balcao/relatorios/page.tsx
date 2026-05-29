import { redirect } from "next/navigation";
import { ReportsPageClient } from "@/components/balcao/reports-page-client";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function RelatoriosPage() {
  const session = await getSession();
  if (!session || session.typ !== "tenant" || !session.tid) {
    redirect("/login?next=/balcao/relatorios");
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Relatórios</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Resumo financeiro e de presença por período. Exporte listas em CSV para o
        contador ou gestão.
      </p>
      <div className="mt-8">
        <ReportsPageClient />
      </div>
    </main>
  );
}
