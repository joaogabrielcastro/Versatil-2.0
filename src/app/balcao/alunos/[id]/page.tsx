import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { StudentDetailNav } from "@/components/balcao/student-detail-nav";
import { StudentEditForm } from "@/components/balcao/student-edit-form";
import { StudentAttendancePanel } from "@/components/balcao/student-attendance-panel";
import { StudentBillingPanel } from "@/components/balcao/student-billing-panel";
import { StudentSubscriptionsPanel } from "@/components/balcao/student-subscriptions-panel";
import { StudentWorkoutsPanel } from "@/components/balcao/student-workouts-panel";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
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
      <PageHeader
        title={student.fullName}
        description={formatCpf(student.cpf)}
        backHref="/balcao/alunos"
        backLabel="Alunos"
      >
        <StudentStatusBadge status={student.status} />
      </PageHeader>

      <StudentDetailNav />

      <section id="student-dados" className="scroll-mt-36">
        <Card>
          <CardContent className="pt-5">
            <h2 className="text-lg font-medium">Dados do aluno</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Atualize contato e informações cadastrais.
            </p>
            <div className="mt-4 max-w-md">
              <StudentEditForm
                studentId={student.id}
                initial={{
                  fullName: student.fullName,
                  email: student.email,
                  whatsapp: student.whatsapp,
                  birthDate: student.birthDate,
                }}
              />
            </div>
          </CardContent>
        </Card>
      </section>

      <section id="student-presenca" className="mt-8 scroll-mt-36">
        <h2 className="text-lg font-medium">Presença na academia</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Dias em que o aluno passou na catraca (reconhecimento facial).
        </p>
        <div className="mt-4">
          <StudentAttendancePanel studentId={student.id} />
        </div>
      </section>

      <section id="student-treinos" className="mt-8 scroll-mt-36">
        <h2 className="text-lg font-medium">Treinos</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Atribua um modelo pré-fixado, edite exercícios e imprima para o aluno.
        </p>
        <div className="mt-4">
          <StudentWorkoutsPanel studentId={student.id} />
        </div>
      </section>

      <section id="student-assinaturas" className="mt-8 scroll-mt-36">
        <h2 className="text-lg font-medium">Assinaturas</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Vincule planos ao aluno (mensalidade, pacotes).
        </p>
        <div className="mt-4">
          <StudentSubscriptionsPanel studentId={student.id} />
        </div>
      </section>

      <section id="student-cobranca" className="mt-8 scroll-mt-36 pb-4">
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
