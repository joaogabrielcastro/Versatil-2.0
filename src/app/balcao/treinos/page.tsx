import { redirect } from "next/navigation";
import { WorkoutTemplatesManageClient } from "@/components/balcao/workout-templates-manage-client";
import { PageHeader } from "@/components/ui/page-header";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function TreinosPage() {
  const session = await getSession();
  if (!session || session.typ !== "tenant" || !session.tid) {
    redirect("/login");
  }

  const isAdmin = session.role === "tenant_admin";

  return (
    <main className="w-full px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <PageHeader
        title="Modelos de treino"
        description="Treinos pré-fixados para imprimir e entregar aos alunos. Atribua na ficha do aluno e personalize exercícios quando necessário."
        backHref="/balcao"
        backLabel="Painel"
      />
      <div className="mt-8">
        <WorkoutTemplatesManageClient isAdmin={isAdmin} />
      </div>
    </main>
  );
}
