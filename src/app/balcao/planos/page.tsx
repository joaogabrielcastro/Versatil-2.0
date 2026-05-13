import Link from "next/link";
import { redirect } from "next/navigation";
import { PlanosManageClient } from "@/components/balcao/planos-manage-client";
import { Button } from "@/components/ui/button";
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
      <Button variant="outline" size="sm" asChild>
        <Link href="/balcao">← Painel</Link>
      </Button>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">Planos</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Planos de assinatura usados na ficha do aluno.
      </p>
      <div className="mt-8">
        <PlanosManageClient isAdmin={isAdmin} />
      </div>
    </main>
  );
}
