"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoutButton } from "@/components/logout-button";
import { VersatilLogo } from "@/components/brand/versatil-logo";

const baseLinks = [
  { href: "/balcao", label: "Painel", exact: true },
  { href: "/balcao/alunos", label: "Alunos" },
  { href: "/balcao/cobranca", label: "Cobrança" },
  { href: "/balcao/presenca", label: "Presença" },
  { href: "/balcao/treinos", label: "Treinos" },
  { href: "/balcao/planos", label: "Planos" },
  { href: "/balcao/relatorios", label: "Relatórios" },
  { href: "/imprimir-treino?slug=demo", label: "Terminal aluno", external: true },
] as const;

const adminLinks = [
  { href: "/balcao/configuracoes/usuarios", label: "Usuários" },
  { href: "/balcao/configuracoes/integracoes", label: "Integrações" },
] as const;

export function BalcaoNav({ isAdmin = false }: { isAdmin?: boolean }) {
  const pathname = usePathname();
  const links = isAdmin ? [...baseLinks, ...adminLinks] : baseLinks;

  return (
    <nav className="balcao-nav border-b border-border bg-card shadow-sm">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-6 py-3">
        <VersatilLogo href="/balcao" height={44} />
        <div className="flex flex-wrap items-center gap-x-1 gap-y-2 text-sm">
          {links.map((link) => {
            const active =
              "exact" in link && link.exact
                ? pathname === link.href.split("?")[0]
                : pathname.startsWith(link.href);
            const cls = active
              ? "rounded-md bg-primary/10 px-2.5 py-1 font-medium text-primary"
              : "rounded-md px-2.5 py-1 font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground";
            if ("external" in link && link.external) {
              return (
                <a
                  key={link.href}
                  className={cls}
                  href={link.href}
                  target="_blank"
                  rel="noreferrer"
                >
                  {link.label}
                </a>
              );
            }
            return (
              <Link key={link.href} className={cls} href={link.href}>
                {link.label}
              </Link>
            );
          })}
          <LogoutButton />
        </div>
      </div>
    </nav>
  );
}
