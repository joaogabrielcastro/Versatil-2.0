import Link from "next/link";
import { redirect } from "next/navigation";
import { PagarmeSettingsClient } from "@/components/balcao/pagarme-settings-client";
import { PaymentSettingsClient } from "@/components/balcao/payment-settings-client";
import { StoneSettingsClient } from "@/components/balcao/stone-settings-client";
import { Button } from "@/components/ui/button";
import { getEnv } from "@/lib/env";
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

  const appUrl = getEnv().APP_URL ?? "http://localhost:3000";

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <Button variant="outline" size="sm" asChild>
        <Link href="/balcao">← Painel</Link>
      </Button>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">Pagamentos</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Provedores de cobrança online. As credenciais ficam cifradas e são usadas
        apenas no servidor.
      </p>

      <section className="mt-8 rounded-lg border p-6">
        <h2 className="text-lg font-medium">Pagar.me — online e recorrência</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Cobrança por Pix, boleto e cartão. Base para a renovação automática.
        </p>
        <div className="mt-4">
          <PagarmeSettingsClient appUrl={appUrl} />
        </div>
      </section>

      <section className="mt-8 rounded-lg border p-6">
        <h2 className="text-lg font-medium">Stone Connect — maquininha (POS)</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Cobrança presencial na maquininha Stone. Requer habilitação no Stone
          Partner Program (ServiceRefererName) e POS integrado. A confirmação usa
          o mesmo webhook do Pagar.me.
        </p>
        <div className="mt-4">
          <StoneSettingsClient />
        </div>
      </section>

      <section className="mt-8 rounded-lg border p-6">
        <h2 className="text-lg font-medium">Stripe (legado)</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Mantido para integrações existentes.
        </p>
        <div className="mt-4">
          <PaymentSettingsClient />
        </div>
      </section>
    </main>
  );
}
