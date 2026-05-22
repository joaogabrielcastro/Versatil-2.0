import { redirect } from "next/navigation";
import { WorkoutTemplatesManageClient } from "@/components/balcao/workout-templates-manage-client";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function TreinosPage() {
  const session = await getSession();
  if (!session || session.typ !== "tenant" || !session.tid) {
    redirect("/login");
  }

  const isAdmin = session.role === "tenant_admin";

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Modelos de treino</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Treinos pré-fixados para imprimir e entregar aos alunos. Atribua na ficha do aluno e
        personalize exercícios quando necessário.
      </p>
      <div className="mt-8">
        <WorkoutTemplatesManageClient isAdmin={isAdmin} />
      </div>
    </main>
  );
}
