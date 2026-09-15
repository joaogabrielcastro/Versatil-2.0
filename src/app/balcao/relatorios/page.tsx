import { redirect } from "next/navigation";
import { ReportsPageClient } from "@/components/balcao/reports-page-client";
import { PageHeader } from "@/components/ui/page-header";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function RelatoriosPage() {
  const session = await getSession();
  if (!session || session.typ !== "tenant" || !session.tid) {
    redirect("/login?next=/balcao/relatorios");
  }

  return (
    <main className="w-full px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <PageHeader
        title="Relatórios"
        description="Resumo financeiro e de presença por período. Exporte listas em CSV para o contador ou gestão."
        backHref="/balcao"
        backLabel="Painel"
      />
      <div className="mt-8">
        <ReportsPageClient />
      </div>
    </main>
  );
}
