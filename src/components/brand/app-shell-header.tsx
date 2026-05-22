import { VersatilLogo } from "@/components/brand/versatil-logo";

/** Cabeçalho com logo para telas públicas (login, terminal do aluno). */
export function AppShellHeader({
  title,
  subtitle,
}: {
  title?: string;
  subtitle?: string;
}) {
  return (
    <header className="flex flex-col items-center gap-3 text-center">
      <VersatilLogo height={64} priority />
      {title ? (
        <h1 className="text-xl font-semibold tracking-tight text-foreground">{title}</h1>
      ) : null}
      {subtitle ? (
        <p className="max-w-md text-sm text-muted-foreground">{subtitle}</p>
      ) : null}
    </header>
  );
}
