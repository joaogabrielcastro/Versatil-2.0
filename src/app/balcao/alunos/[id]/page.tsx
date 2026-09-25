import { notFound, redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
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
import { effectiveStudentStatusSql } from "@/lib/services/student-effective-status";
import { recordRenewalBillingGap, renewalCoverageForStudent } from "@/lib/billing/renewal-access";

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
      .select({
        id: students.id,
        fullName: students.fullName,
        cpf: students.cpf,
        email: students.email,
        whatsapp: students.whatsapp,
        birthDate: students.birthDate,
        facialVectorRef: students.facialVectorRef,
        status: effectiveStudentStatusSql(),
      })
      .from(students)
      .where(and(eq(students.id, id), eq(students.tenantId, tenantId)))
      .limit(1);
    if (!row) return null;
    const renewal = await renewalCoverageForStudent(tx, tenantId, id);
    if (renewal.review) await recordRenewalBillingGap(tx, tenantId, renewal.review);
    return {
      ...row,
      renewalChargeMissing: renewal.coversNow && renewal.chargeMissing && row.status !== "delinquent",
    };
  });

  if (!student) {
    notFound();
  }

  return (
    <main className="w-full px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <PageHeader
        title={student.fullName}
        description={formatCpf(student.cpf)}
        backHref="/balcao/alunos"
        backLabel="Alunos"
      >
        <StudentStatusBadge status={student.status} />
      </PageHeader>
      {student.renewalChargeMissing ? (
        <p className="mt-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          A renovação já começou, mas a cobrança deste período não foi gerada.
          Isso não é inadimplência. Em Cobrança, use Gerar faturas do período.
          A catraca permanece fechada até essa cobrança existir.
        </p>
      ) : null}

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
          <StudentSubscriptionsPanel
            studentId={student.id}
            isAdmin={session.role === "tenant_admin"}
          />
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
