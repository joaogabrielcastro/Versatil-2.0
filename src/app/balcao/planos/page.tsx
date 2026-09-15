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
    <main className="w-full px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <PageHeader
        title="Planos"
        description="Planos por modalidade e valor (musculação, lutas, dança, spinning, CrossFit…). Edite o preço quando a academia mudar a mensalidade."
        backHref="/balcao"
        backLabel="Painel"
      />
      <div className="mt-8">
        <PlanosManageClient isAdmin={isAdmin} />
      </div>
    </main>
  );
}
