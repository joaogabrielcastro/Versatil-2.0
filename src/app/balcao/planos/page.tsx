import { redirect } from "next/navigation";
import { PlanosManageClient } from "@/components/balcao/planos-manage-client";
import { PageHeader } from "@/components/ui/page-header";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function PlanosPage() {
  const session = await getSession();
  if (!session || session.typ !== "tenant" || !session.tid) {
    redirect("/login");
  }
  const isAdmin = session.role === "tenant_admin";

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <PageHeader
        title="Planos"
        description="Planos de assinatura usados na ficha do aluno."
        backHref="/balcao"
        backLabel="Painel"
      />
      <div className="mt-8">
        <PlanosManageClient isAdmin={isAdmin} />
      </div>
    </main>
  );
}
