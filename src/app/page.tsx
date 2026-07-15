import Link from "next/link";
import { CreditCard, DoorOpen, Printer, Users } from "lucide-react";
import { VersatilLogo } from "@/components/brand/versatil-logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { BRAND } from "@/lib/brand";

const features = [
  {
    title: "Balcão e alunos",
    desc: "Cadastro, planos, assinaturas e ficha completa de cada aluno.",
    icon: Users,
  },
  {
    title: "Cobrança na recepção",
    desc: "Faturas automáticas, registro de Pix, dinheiro ou cartão Stone.",
    icon: CreditCard,
  },
  {
    title: "Catraca e presença",
    desc: "Libera ou bloqueia por inadimplência; presença registrada automaticamente.",
    icon: DoorOpen,
  },
  {
    title: "Treino térmico",
    desc: "Modelos de treino e impressão em cupom 80 mm no terminal do aluno.",
    icon: Printer,
  },
] as const;

const showDemoCredentials =
  process.env.NODE_ENV !== "production" ||
  process.env.SHOW_DEMO_CREDENTIALS === "true";

export default function HomePage() {
  return (
    <main className="mx-auto min-h-screen max-w-4xl px-6 py-12">
      <div className="flex flex-col items-center gap-6 text-center">
        <VersatilLogo height={80} priority />
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-primary sm:text-4xl">
            {BRAND.name}
          </h1>
          <p className="mx-auto mt-3 max-w-lg text-base text-muted-foreground">
            Gestão completa da academia — recepção, cobrança, catraca facial e
            treinos em um só lugar.
          </p>
        </div>
        <Button asChild size="lg" className="shadow-md">
          <Link href="/login">Entrar — equipe da academia</Link>
        </Button>
      </div>

      <section className="mt-14 grid gap-4 sm:grid-cols-2">
        {features.map((f) => (
          <Card
            key={f.title}
            className="transition-shadow hover:shadow-md"
          >
            <CardContent className="flex gap-4 pt-5">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <f.icon className="size-5" aria-hidden />
              </div>
              <div className="text-left">
                <h2 className="font-semibold text-foreground">{f.title}</h2>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  {f.desc}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="mt-10 grid gap-4 md:grid-cols-2">
        {showDemoCredentials ? (
          <Card className="border-primary/20 bg-primary/[0.03]">
            <CardContent className="pt-5 text-left">
              <p className="font-medium text-foreground">Demonstração</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Use estas credenciais para explorar o sistema:
              </p>
              <dl className="mt-3 space-y-1.5 font-mono text-xs text-foreground">
                <div className="rounded-md bg-background/80 px-2 py-1">
                  <dt className="inline text-muted-foreground">Academia: </dt>
                  <dd className="inline">demo</dd>
                </div>
                <div className="rounded-md bg-background/80 px-2 py-1">
                  <dt className="inline text-muted-foreground">E-mail: </dt>
                  <dd className="inline">recep@demo.com</dd>
                </div>
                <div className="rounded-md bg-background/80 px-2 py-1">
                  <dt className="inline text-muted-foreground">Senha: </dt>
                  <dd className="inline">demo12345678</dd>
                </div>
              </dl>
              <Button asChild variant="outline" size="sm" className="mt-4">
                <Link href="/login?demo=1">Entrar com conta demo</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="pt-5 text-left">
              <p className="font-medium">Para academias</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Acesso exclusivo para equipes cadastradas. Solicite credenciais ao
                administrador da sua unidade.
              </p>
              <Button asChild variant="outline" size="sm" className="mt-4">
                <Link href="/login">Acessar o sistema</Link>
              </Button>
            </CardContent>
          </Card>
        )}

        <Card className="border-dashed">
          <CardContent className="pt-5 text-left">
            <p className="font-medium">Terminal do aluno</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Impressão do treino do dia — sem login, direto na recepção ou totem.
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Disponível após o login no balcão, no menu <strong>Terminal</strong>.
            </p>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
