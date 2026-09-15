import Link from "next/link";
import {
  BarChart3,
  CreditCard,
  DoorOpen,
  Dumbbell,
  Monitor,
  Users,
} from "lucide-react";
import { VersatilLogo } from "@/components/brand/versatil-logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { shouldShowDemoCredentials } from "@/lib/ui/show-demo-credentials";

const features = [
  {
    title: "Gestão de alunos",
    desc: "Cadastre alunos, planos, assinaturas e informações da ficha.",
    icon: Users,
  },
  {
    title: "Cobranças",
    desc: "Controle pagamentos, mensalidades, Pix, dinheiro e cartão.",
    icon: CreditCard,
  },
  {
    title: "Controle de acesso",
    desc: "Gerencie presença e integração com a catraca facial.",
    icon: DoorOpen,
  },
  {
    title: "Treinos",
    desc: "Consulte modelos de treino e disponibilize as informações ao aluno.",
    icon: Dumbbell,
  },
  {
    title: "Relatórios",
    desc: "Acompanhe informações importantes da operação da academia.",
    icon: BarChart3,
  },
  {
    title: "Terminal do aluno",
    desc: "Consulte e imprima o treino diretamente na recepção.",
    icon: Monitor,
  },
] as const;

const showDemoCredentials = shouldShowDemoCredentials({
  NODE_ENV: process.env.NODE_ENV,
  SHOW_DEMO_CREDENTIALS: process.env.SHOW_DEMO_CREDENTIALS,
});

export default function HomePage() {
  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-14 lg:px-10 lg:py-16">
        {/* Hero */}
        <header className="flex flex-col items-center text-center">
          <VersatilLogo height={72} priority />
          <h1 className="mt-8 max-w-2xl text-3xl font-semibold tracking-tight text-foreground sm:text-4xl lg:text-[2.75rem] lg:leading-tight">
            Gestão completa para sua academia.
          </h1>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            Alunos, planos, pagamentos, presença e treinos em um só lugar.
          </p>
          <div className="mt-8 flex w-full max-w-sm flex-col items-center gap-3 sm:max-w-none">
            <Button
              asChild
              size="lg"
              className="h-12 w-full px-8 text-base shadow-sm transition-opacity sm:w-auto"
            >
              <Link href="/login" aria-label="Entrar no sistema — equipe da academia">
                Entrar no sistema →
              </Link>
            </Button>
            <p className="text-sm text-muted-foreground">
              Acesso exclusivo para a equipe da academia
            </p>
          </div>
        </header>

        {/* Funcionalidades */}
        <section className="mt-16 sm:mt-20" aria-labelledby="features-heading">
          <div className="mx-auto max-w-2xl text-center">
            <h2
              id="features-heading"
              className="text-2xl font-semibold tracking-tight text-foreground sm:text-[1.75rem]"
            >
              Tudo o que sua academia precisa
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
              Uma plataforma para simplificar a rotina da recepção e melhorar o
              controle da academia.
            </p>
          </div>

          <ul className="mt-10 grid list-none gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <li key={f.title}>
                <Card className="h-full border-border/80 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-shadow duration-200 hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)]">
                  <CardContent className="flex h-full flex-col gap-4 p-5 sm:p-6">
                    <div
                      className="flex size-11 items-center justify-center rounded-lg bg-primary/10 text-primary"
                      aria-hidden
                    >
                      <f.icon className="size-5" strokeWidth={1.75} />
                    </div>
                    <div>
                      <h3 className="text-base font-semibold tracking-tight text-foreground">
                        {f.title}
                      </h3>
                      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                        {f.desc}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        </section>

        {/* Acessos */}
        <section
          className="mt-16 sm:mt-20"
          aria-labelledby="access-heading"
        >
          <h2 id="access-heading" className="sr-only">
            Áreas de acesso
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="border-border/80 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-shadow duration-200 hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)]">
              <CardContent className="flex h-full flex-col p-6 sm:p-7">
                <h3 className="text-lg font-semibold tracking-tight text-foreground sm:text-xl">
                  Equipe da academia
                </h3>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">
                  Acesse o sistema para gerenciar alunos, pagamentos, presença e
                  treinos.
                </p>
                <Button asChild className="mt-6 h-11 w-full sm:w-auto">
                  <Link href="/login" aria-label="Entrar no sistema — equipe da academia">
                    Entrar no sistema →
                  </Link>
                </Button>
              </CardContent>
            </Card>

            <Card className="border-border/80 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-shadow duration-200 hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)]">
              <CardContent className="flex h-full flex-col p-6 sm:p-7">
                <h3 className="text-lg font-semibold tracking-tight text-foreground sm:text-xl">
                  Terminal do aluno
                </h3>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">
                  Permita que o aluno consulte e imprima seu treino diretamente
                  na recepção.
                </p>
                <Button
                  asChild
                  variant="outline"
                  className="mt-6 h-11 w-full sm:w-auto"
                >
                  <Link
                    href="/imprimir-treino"
                    aria-label="Abrir terminal do aluno"
                  >
                    Abrir terminal →
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </section>

        {showDemoCredentials ? (
          <section className="mt-10" aria-label="Credenciais de demonstração">
            <Card className="border-primary/20 bg-primary/[0.03]">
              <CardContent className="p-5 text-left sm:p-6">
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
          </section>
        ) : null}
      </div>
    </main>
  );
}
