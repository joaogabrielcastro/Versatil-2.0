import Link from "next/link";
import { VersatilLogo } from "@/components/brand/versatil-logo";
import { Button } from "@/components/ui/button";
import { BRAND } from "@/lib/brand";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-8 px-6 py-12">
      <VersatilLogo height={80} priority />
      <div className="text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-primary">
          {BRAND.name}
        </h1>
        <p className="mt-3 text-muted-foreground">
          Sistema de gestão — treinos, presença na catraca e cobrança.
        </p>
      </div>

      <div className="grid w-full max-w-md gap-4 text-sm">
        <div className="rounded-lg border border-border bg-card p-4 text-left">
          <p className="font-medium text-foreground">Equipe da academia</p>
          <p className="mt-1 text-muted-foreground">
            Faça login com e-mail e senha. Depois do login você entra no{" "}
            <strong className="font-medium text-foreground">painel do balcão</strong>{" "}
            (alunos, cobrança, treinos).
          </p>
          <Button asChild className="mt-3 w-full sm:w-auto">
            <Link href="/login">Entrar — equipe</Link>
          </Button>
        </div>

        <div className="rounded-lg border border-border bg-card p-4 text-left">
          <p className="font-medium text-foreground">Aluno</p>
          <p className="mt-1 text-muted-foreground">
            Terminal para imprimir o treino do dia (não precisa de login).
          </p>
          <Button asChild variant="outline" className="mt-3 w-full sm:w-auto">
            <Link href="/imprimir-treino?slug=demo">Terminal do aluno</Link>
          </Button>
        </div>

        <div className="rounded-lg border border-dashed border-border p-4 text-left">
          <p className="font-medium text-foreground">Administração da plataforma</p>
          <p className="mt-1 text-muted-foreground">
            Super admin — gestão de academias (não é o balcão da recepção).
          </p>
          <Button asChild variant="ghost" size="sm" className="mt-2 px-0">
            <Link href="/login/plataforma">Login plataforma →</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
