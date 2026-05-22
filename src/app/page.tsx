import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-8 px-6">
      <div>
        <p className="text-sm text-muted-foreground">MVP · Multi-tenant</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          Tecnofit Enxuto
        </h1>
        <p className="mt-3 text-muted-foreground">
          Base Next.js + Drizzle + PostgreSQL (RLS) + Redis/BullMQ. Configure{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 text-sm">
            .env
          </code>{" "}
          e suba Postgres/Redis com Docker Compose.
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        <Button asChild>
          <Link href="/login">Login academia</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/balcao">Balcão</Link>
        </Button>
        <Button asChild>
          <Link href="/imprimir-treino?slug=demo">Imprimir treino (aluno)</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/admin">Admin (plataforma)</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/api/health">Health check</Link>
        </Button>
      </div>
    </main>
  );
}
