import Link from "next/link";
import { redirect } from "next/navigation";
import { TenantUsersClient } from "@/components/balcao/tenant-users-client";
import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function UsuariosPage() {
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
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">Usuários</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Gerencie quem acessa o balcão e defina se cada pessoa é{" "}
        <strong>Administrador</strong> ou <strong>Recepcionista</strong>.
      </p>
      <div className="mt-8">
        <TenantUsersClient currentUserId={session.sub} />
      </div>
    </main>
  );
}
