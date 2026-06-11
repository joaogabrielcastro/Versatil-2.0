import Link from "next/link";
import { VersatilLogo } from "@/components/brand/versatil-logo";
import { Button } from "@/components/ui/button";
import { BRAND } from "@/lib/brand";

const features = [
  {
    title: "Balcão e alunos",
    desc: "Cadastro, planos, assinaturas e ficha completa de cada aluno.",
  },
  {
    title: "Cobrança na recepção",
    desc: "Faturas automáticas, registro de Pix, dinheiro ou cartão Stone.",
  },
  {
    title: "Catraca e presença",
    desc: "Libera ou bloqueia por inadimplência; presença registrada automaticamente.",
  },
  {
    title: "Treino térmico",
    desc: "Modelos de treino e impressão em cupom 80 mm no terminal do aluno.",
  },
];

export default function HomePage() {
  return (
    <main className="mx-auto min-h-screen max-w-4xl px-6 py-12">
      <div className="flex flex-col items-center gap-6 text-center">
        <VersatilLogo height={72} priority />
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-primary">
            {BRAND.name}
          </h1>
          <p className="mx-auto mt-3 max-w-lg text-muted-foreground">
            Gestão completa da academia — recepção, cobrança, catraca facial e
            treinos em um só lugar.
          </p>
        </div>
        <Button asChild size="lg">
          <Link href="/login">Entrar — equipe da academia</Link>
        </Button>
      </div>

      <section className="mt-14 grid gap-4 sm:grid-cols-2">
        {features.map((f) => (
          <div
            key={f.title}
            className="rounded-lg border border-border bg-card p-5 text-left shadow-sm"
          >
            <h2 className="font-semibold text-foreground">{f.title}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{f.desc}</p>
          </div>
        ))}
      </section>

      <section className="mt-10 grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-5 text-left">
          <p className="font-medium">Demonstração</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Use estas credenciais para explorar o sistema:
          </p>
          <dl className="mt-3 space-y-1 font-mono text-xs text-foreground">
            <div>
              <dt className="inline text-muted-foreground">Slug: </dt>
              <dd className="inline">demo</dd>
            </div>
            <div>
              <dt className="inline text-muted-foreground">E-mail: </dt>
              <dd className="inline">recep@demo.com</dd>
            </div>
            <div>
              <dt className="inline text-muted-foreground">Senha: </dt>
              <dd className="inline">demo12345678</dd>
            </div>
          </dl>
          <Button asChild variant="outline" size="sm" className="mt-4">
            <Link href="/login?demo=1">Entrar com conta demo</Link>
          </Button>
        </div>

        <div className="rounded-lg border border-dashed border-border p-5 text-left">
          <p className="font-medium">Terminal do aluno</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Impressão do treino do dia — sem login, direto na recepção ou totem.
          </p>
          <Button asChild variant="outline" size="sm" className="mt-4">
            <Link href="/imprimir-treino?slug=demo">Abrir terminal</Link>
          </Button>
        </div>
      </section>
    </main>
  );
}
