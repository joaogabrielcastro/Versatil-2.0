import Link from "next/link";
import { redirect } from "next/navigation";
import { PaymentSettingsClient } from "@/components/balcao/payment-settings-client";
import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function PagamentosConfigPage() {
  const session = await getSession();
  if (!session || session.typ !== "tenant" || !session.tid) {
    redirect("/login");
  }
  if (session.role !== "tenant_admin") {
    redirect("/balcao");
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <Button variant="outline" size="sm" asChild>
        <Link href="/balcao">← Painel</Link>
      </Button>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">
        Pagamentos (credenciais)
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Chaves ficam cifradas na base. Use STRIPE_WEBHOOK_SECRET e APP_URL no
        servidor para o webhook Stripe.
      </p>
      <div className="mt-8">
        <PaymentSettingsClient />
      </div>
    </main>
  );
}
