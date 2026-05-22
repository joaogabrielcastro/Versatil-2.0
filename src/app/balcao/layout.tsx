import Link from "next/link";

export default function BalcaoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <nav className="balcao-nav border-b border-border bg-card/40">
        <div className="mx-auto flex max-w-5xl flex-wrap gap-3 px-6 py-3 text-sm">
          <Link className="text-muted-foreground hover:text-foreground" href="/balcao">
            Painel
          </Link>
          <Link className="text-muted-foreground hover:text-foreground" href="/balcao/alunos">
            Alunos
          </Link>
          <Link className="text-muted-foreground hover:text-foreground" href="/balcao/treinos">
            Treinos
          </Link>
          <Link className="text-muted-foreground hover:text-foreground" href="/balcao/presenca">
            Presença
          </Link>
          <Link
            className="text-muted-foreground hover:text-foreground"
            href="/imprimir-treino"
            target="_blank"
          >
            Terminal aluno
          </Link>
          <Link className="text-muted-foreground hover:text-foreground" href="/balcao/importar">
            Importar
          </Link>
          <Link className="text-muted-foreground hover:text-foreground" href="/balcao/planos">
            Planos
          </Link>
          <Link
            className="text-muted-foreground hover:text-foreground"
            href="/balcao/configuracoes/pagamentos"
          >
            Pagamentos
          </Link>
        </div>
      </nav>
      {children}
    </div>
  );
}
