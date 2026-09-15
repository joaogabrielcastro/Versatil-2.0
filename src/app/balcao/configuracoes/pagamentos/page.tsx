import Link from "next/link";
import { redirect } from "next/navigation";
import { StoneSettingsClient } from "@/components/balcao/stone-settings-client";
import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function PagamentosPage() {
  const session = await getSession();
  if (!session || session.typ !== "tenant" || !session.tid) {
    redirect("/login");
  }
  if (session.role !== "tenant_admin") {
    redirect("/balcao");
  }

  return (
    <main className="w-full px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <Button variant="outline" size="sm" asChild>
        <Link href="/balcao">← Painel</Link>
      </Button>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">Pagamentos</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        O Versátil cobra somente via Stone Connect (maquininha). Registro manual
        de dinheiro, Pix ou cartão já recebido continua em Cobrança.
      </p>

      <section className="mt-8 rounded-lg border p-6">
        <h2 className="text-lg font-medium">Stone Connect — maquininha (POS)</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Cobrança presencial e renovação automática enviam a fatura ao POS.
          Requer Stone Partner Program (`ServiceRefererName`) e serial da
          maquininha. A confirmação chega pelo webhook autenticado.
        </p>
        <div className="mt-4">
          <StoneSettingsClient />
        </div>
      </section>
    </main>
  );
}
