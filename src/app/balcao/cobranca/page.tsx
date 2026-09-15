import { redirect } from "next/navigation";
import { CobrancaBalcaoClient } from "@/components/balcao/cobranca-balcao-client";
import { PageHeader } from "@/components/ui/page-header";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function CobrancaPage() {
  const session = await getSession();
  if (!session || session.typ !== "tenant" || !session.tid) {
    redirect("/login");
  }

  return (
    <main className="w-full px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <PageHeader
        title="Cobrança"
        description="Faturas em aberto e registro de pagamentos (dinheiro, Pix, cartão Stone)."
        backHref="/balcao"
        backLabel="Painel"
      />
      <div className="mt-8">
        <CobrancaBalcaoClient isAdmin={session.role === "tenant_admin"} />
      </div>
    </main>
  );
}
