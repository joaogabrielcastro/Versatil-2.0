import { redirect } from "next/navigation";
import { DailyAttendanceClient } from "@/components/balcao/daily-attendance-client";
import { PageHeader } from "@/components/ui/page-header";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function PresencaPage() {
  const session = await getSession();
  if (!session || session.typ !== "tenant" || !session.tid) {
    redirect("/login");
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <PageHeader
        title="Presença na academia"
        description="Quem passou na catraca com acesso liberado. O reconhecimento facial registra cada entrada automaticamente."
        backHref="/balcao"
        backLabel="Painel"
      />
      <div className="mt-8">
        <DailyAttendanceClient />
      </div>
    </main>
  );
}
