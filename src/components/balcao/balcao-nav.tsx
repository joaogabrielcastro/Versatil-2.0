"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoutButton } from "@/components/logout-button";
import { VersatilLogo } from "@/components/brand/versatil-logo";
import { cn } from "@/lib/utils";

type NavLink = {
  href: string;
  label: string;
  exact?: boolean;
  external?: boolean;
};

function buildLinks(tenantSlug: string): NavLink[] {
  return [
    { href: "/balcao", label: "Painel", exact: true },
    { href: "/balcao/alunos", label: "Alunos" },
    { href: "/balcao/cobranca", label: "Cobrança" },
    { href: "/balcao/presenca", label: "Presença" },
    { href: "/balcao/treinos", label: "Treinos" },
    { href: "/balcao/planos", label: "Planos" },
    { href: "/balcao/relatorios", label: "Relatórios" },
    {
      href: `/imprimir-treino?slug=${encodeURIComponent(tenantSlug)}`,
      label: "Terminal",
      external: true,
    },
  ];
}

const adminLinks: NavLink[] = [
  { href: "/balcao/configuracoes/usuarios", label: "Usuários" },
  { href: "/balcao/configuracoes/integracoes", label: "Integrações" },
];

export function BalcaoNav({
  isAdmin = false,
  tenantSlug = "demo",
}: {
  isAdmin?: boolean;
  tenantSlug?: string;
}) {
  const pathname = usePathname();
  const links = isAdmin
    ? [...buildLinks(tenantSlug), ...adminLinks]
    : buildLinks(tenantSlug);

  return (
    <nav className="balcao-nav sticky top-0 z-40 border-b border-border bg-card/95 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-card/80">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="flex h-14 items-center justify-between gap-3">
          <VersatilLogo href="/balcao" height={40} />
          <LogoutButton />
        </div>
        <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6">
          <div className="flex w-max min-w-full gap-1 text-sm">
            {links.map((link) => {
              const basePath = link.href.split("?")[0] ?? link.href;
              const active = link.exact
                ? pathname === basePath
                : pathname.startsWith(basePath);
              const cls = cn(
                "whitespace-nowrap rounded-md px-3 py-1.5 font-medium transition-colors",
                active
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              );
              if (link.external) {
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
          </div>
        </div>
      </div>
    </nav>
  );
}
