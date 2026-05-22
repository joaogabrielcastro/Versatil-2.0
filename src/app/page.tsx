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
          Sistema de gestão — balcão, treinos, presença na catraca e cobrança.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        <Button asChild>
          <Link href="/login">Login equipe</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/imprimir-treino?slug=demo">Terminal do aluno</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/balcao">Balcão</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/admin">Admin plataforma</Link>
        </Button>
      </div>
    </main>
  );
}
