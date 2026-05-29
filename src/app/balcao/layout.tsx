import Link from "next/link";
import { VersatilLogo } from "@/components/brand/versatil-logo";

const navLink =
  "text-muted-foreground transition-colors hover:text-primary font-medium";

export default function BalcaoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <nav className="balcao-nav border-b border-border bg-card shadow-sm">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-6 py-3">
          <VersatilLogo href="/balcao" height={44} />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <Link className={navLink} href="/balcao">
              Painel
            </Link>
            <Link className={navLink} href="/balcao/alunos">
              Alunos
            </Link>
            <Link className={navLink} href="/balcao/treinos">
              Treinos
            </Link>
            <Link className={navLink} href="/balcao/presenca">
              Presença
            </Link>
            <Link className={navLink} href="/balcao/relatorios">
              Relatórios
            </Link>
            <Link className={navLink} href="/imprimir-treino" target="_blank">
              Terminal aluno
            </Link>
            <Link className={navLink} href="/balcao/importar">
              Importar
            </Link>
            <Link className={navLink} href="/balcao/planos">
              Planos
            </Link>
            <Link className={navLink} href="/balcao/configuracoes/pagamentos">
              Pagamentos
            </Link>
          </div>
        </div>
      </nav>
      {children}
    </div>
  );
}
