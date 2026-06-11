import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { StudentAttendancePanel } from "@/components/balcao/student-attendance-panel";
import { StudentBillingPanel } from "@/components/balcao/student-billing-panel";
import { StudentSubscriptionsPanel } from "@/components/balcao/student-subscriptions-panel";
import { StudentWorkoutsPanel } from "@/components/balcao/student-workouts-panel";
import { Button } from "@/components/ui/button";
import { StudentStatusBadge } from "@/components/ui/status-badge";
import { formatCpf } from "@/lib/labels";
import { getSession } from "@/lib/auth/session";
import { students } from "@/lib/db/schema";
import { withTenantTransaction } from "@/lib/db/with-tenant";

export const dynamic = "force-dynamic";

export default async function AlunoDetalhePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session || session.typ !== "tenant" || !session.tid) {
    redirect("/login");
  }
  const tenantId = session.tid;
  const { id } = await params;

  const student = await withTenantTransaction(tenantId, async (tx) => {
    const [row] = await tx
      .select()
      .from(students)
      .where(eq(students.id, id))
      .limit(1);
    return row ?? null;
  });

  if (!student) {
    notFound();
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Button variant="outline" size="sm" asChild>
            <Link href="/balcao/alunos">← Voltar</Link>
          </Button>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight">
            {student.fullName}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{formatCpf(student.cpf)}</p>
          <div className="mt-3">
            <StudentStatusBadge status={student.status} />
          </div>
        </div>
      </div>

      <section className="mt-10">
        <h2 className="text-lg font-medium">Presença na academia</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Dias em que o aluno passou na catraca (reconhecimento facial).
        </p>
        <div className="mt-4">
          <StudentAttendancePanel studentId={student.id} />
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-medium">Treinos</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Atribua um modelo pré-fixado, edite exercícios e imprima para o aluno.
        </p>
        <div className="mt-4">
          <StudentWorkoutsPanel studentId={student.id} />
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-medium">Assinaturas</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Vincule planos ao aluno (mensalidade, pacotes).
        </p>
        <div className="mt-4">
          <StudentSubscriptionsPanel studentId={student.id} />
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-medium">Cobrança</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Faturas, liquidação manual na recepção e linha do tempo.
        </p>
        <div className="mt-4">
          <StudentBillingPanel studentId={student.id} />
        </div>
      </section>
    </main>
  );
}
