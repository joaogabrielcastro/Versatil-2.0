import Link from "next/link";
import { redirect } from "next/navigation";
import { CobrancaBalcaoClient } from "@/components/balcao/cobranca-balcao-client";
import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function CobrancaPage() {
  const session = await getSession();
  if (!session || session.typ !== "tenant" || !session.tid) {
    redirect("/login");
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <Button variant="outline" size="sm" asChild>
        <Link href="/balcao">← Painel</Link>
      </Button>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">Cobrança</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Faturas em aberto e registro de pagamentos (dinheiro, Pix, cartão Stone).
      </p>
      <div className="mt-8">
        <CobrancaBalcaoClient isAdmin={session.role === "tenant_admin"} />
      </div>
    </main>
  );
}
