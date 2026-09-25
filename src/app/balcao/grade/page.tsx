import { redirect } from "next/navigation";
import { GradeManageClient } from "@/components/balcao/grade-manage-client";
import { PageHeader } from "@/components/ui/page-header";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function GradePage() {
  const session = await getSession();
  if (!session || session.typ !== "tenant" || !session.tid) {
    redirect("/login");
  }
  const isAdmin = session.role === "tenant_admin";

  return (
    <main className="w-full px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <PageHeader
        title="Grade"
        description="Horários de ginástica, dança, spinning e lutas. A grade não reserva vaga nem marca presença por aula."
        backHref="/balcao"
        backLabel="Painel"
      />
      <div className="mt-8">
        <GradeManageClient isAdmin={isAdmin} />
      </div>
    </main>
  );
}
