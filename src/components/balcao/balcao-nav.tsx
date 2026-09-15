"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BarChart3,
  CreditCard,
  DoorOpen,
  Dumbbell,
  LayoutDashboard,
  Menu,
  Monitor,
  Package,
  Settings,
  Users,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import { LogoutButton } from "@/components/logout-button";
import { VersatilLogo } from "@/components/brand/versatil-logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type NavLink = {
  href: string;
  label: string;
  exact?: boolean;
  external?: boolean;
  icon: LucideIcon;
};

function buildLinks(tenantSlug: string): NavLink[] {
  const terminalHref = tenantSlug
    ? `/imprimir-treino?slug=${encodeURIComponent(tenantSlug)}`
    : "/imprimir-treino";

  return [
    { href: "/balcao", label: "Painel", exact: true, icon: LayoutDashboard },
    { href: "/balcao/alunos", label: "Alunos", icon: Users },
    { href: "/balcao/cobranca", label: "Cobrança", icon: CreditCard },
    { href: "/balcao/presenca", label: "Presença", icon: DoorOpen },
    { href: "/balcao/treinos", label: "Treinos", icon: Dumbbell },
    { href: "/balcao/planos", label: "Planos", icon: Wallet },
    { href: "/balcao/estoque", label: "Estoque", icon: Package },
    { href: "/balcao/relatorios", label: "Relatórios", icon: BarChart3 },
    {
      href: terminalHref,
      label: "Terminal",
      external: true,
      icon: Monitor,
    },
  ];
}

const adminLinks: NavLink[] = [
  { href: "/balcao/configuracoes/usuarios", label: "Usuários", icon: Users },
  {
    href: "/balcao/configuracoes/pagamentos",
    label: "Pagamentos",
    icon: CreditCard,
  },
  {
    href: "/balcao/configuracoes/integracoes",
    label: "Integrações",
    icon: Settings,
  },
];

function NavItems({
  links,
  onNavigate,
}: {
  links: NavLink[];
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <ul className="flex flex-col gap-0.5">
      {links.map((link) => {
        const basePath = link.href.split("?")[0] ?? link.href;
        const active = link.exact
          ? pathname === basePath
          : pathname.startsWith(basePath);
        const Icon = link.icon;
        const cls = cn(
          "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
          active
            ? "bg-primary text-primary-foreground shadow-sm"
            : "text-muted-foreground hover:bg-muted hover:text-foreground",
        );

        if (link.external) {
          return (
            <li key={link.href}>
              <a
                className={cls}
                href={link.href}
                target="_blank"
                rel="noreferrer"
                onClick={onNavigate}
              >
                <Icon className="size-4 shrink-0 opacity-90" aria-hidden />
                {link.label}
              </a>
            </li>
          );
        }

        return (
          <li key={link.href}>
            <Link className={cls} href={link.href} onClick={onNavigate}>
              <Icon className="size-4 shrink-0 opacity-90" aria-hidden />
              {link.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function SidebarBody({
  isAdmin,
  tenantSlug,
  onNavigate,
}: {
  isAdmin: boolean;
  tenantSlug: string;
  onNavigate?: () => void;
}) {
  const mainLinks = buildLinks(tenantSlug);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-4 py-4">
        <VersatilLogo href="/balcao" height={40} />
      </div>

      <nav
        className="flex-1 overflow-y-auto px-3 py-4"
        aria-label="Menu do balcão"
      >
        <NavItems links={mainLinks} onNavigate={onNavigate} />
        {isAdmin ? (
          <div className="mt-6">
            <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Configurações
            </p>
            <NavItems links={adminLinks} onNavigate={onNavigate} />
          </div>
        ) : null}
      </nav>

      <div className="border-t border-border p-3">
        <LogoutButton className="w-full" />
      </div>
    </div>
  );
}

export function BalcaoNav({
  isAdmin = false,
  tenantSlug = "",
}: {
  isAdmin?: boolean;
  tenantSlug?: string;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      {/* Mobile top bar */}
      <header className="balcao-nav sticky top-0 z-40 flex h-14 items-center justify-between gap-3 border-b border-border bg-card px-4 lg:hidden">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 w-9 shrink-0 px-0"
          aria-label={open ? "Fechar menu" : "Abrir menu"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X className="size-4" /> : <Menu className="size-4" />}
        </Button>
        <VersatilLogo href="/balcao" height={36} />
        <LogoutButton />
      </header>

      {/* Mobile drawer */}
      {open ? (
        <div className="balcao-nav fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Fechar menu"
            onClick={() => setOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-[min(18rem,85vw)] flex-col border-r border-border bg-card shadow-lg">
            <SidebarBody
              isAdmin={isAdmin}
              tenantSlug={tenantSlug}
              onNavigate={() => setOpen(false)}
            />
          </aside>
        </div>
      ) : null}

      {/* Desktop sidebar */}
      <aside className="balcao-nav fixed inset-y-0 left-0 z-30 hidden w-60 border-r border-border bg-card lg:flex lg:flex-col">
        <SidebarBody isAdmin={isAdmin} tenantSlug={tenantSlug} />
      </aside>
    </>
  );
}
