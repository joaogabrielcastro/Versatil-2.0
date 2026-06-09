import Link from "next/link";
import { redirect } from "next/navigation";
import { IntegracoesClient } from "@/components/balcao/integracoes-client";
import { Button } from "@/components/ui/button";
import { getEnv } from "@/lib/env";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function IntegracoesPage() {
  const session = await getSession();
  if (!session || session.typ !== "tenant" || !session.tid) {
    redirect("/login");
  }
  if (session.role !== "tenant_admin") {
    redirect("/balcao");
  }

  const appUrl = getEnv().APP_URL ?? "http://localhost:3000";

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <Button variant="outline" size="sm" asChild>
        <Link href="/balcao">← Painel</Link>
      </Button>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">Integrações</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        APIs da catraca (ativa) e Stone (webhook preparado para quando tiver
        credenciais).
      </p>
      <div className="mt-8">
        <IntegracoesClient appUrl={appUrl} />
      </div>
    </main>
  );
}
