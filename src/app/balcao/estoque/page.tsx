import { redirect } from "next/navigation";
import { EstoquePageClient } from "@/components/balcao/estoque-page-client";
import { PageHeader } from "@/components/ui/page-header";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function EstoquePage() {
  const session = await getSession();
  if (!session || session.typ !== "tenant" || !session.tid) {
    redirect("/login?next=/balcao/estoque");
  }
  const isAdmin = session.role === "tenant_admin";

  return (
    <main className="w-full px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <PageHeader
        title="Estoque"
        description="Cadastre o que a academia vende (whey, isotônico, luva, camiseta…) e controle entrada, saída e venda no balcão."
        backHref="/balcao"
        backLabel="Painel"
      />
      <div className="mt-8">
        <EstoquePageClient isAdmin={isAdmin} />
      </div>
    </main>
  );
}
