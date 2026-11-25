"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BarChart3,
  CalendarDays,
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

type NavGroup = { label: string; links: NavLink[] };

/** Menu em grupos (proposta de identidade): o uso diário fica no topo. */
function buildGroups(tenantSlug: string): NavGroup[] {
  const terminalHref = tenantSlug
    ? `/imprimir-treino?slug=${encodeURIComponent(tenantSlug)}`
    : "/imprimir-treino";

  return [
    {
      label: "Operação",
      links: [
        { href: "/balcao", label: "Painel", exact: true, icon: LayoutDashboard },
        { href: "/balcao/alunos", label: "Alunos", icon: Users },
        { href: "/balcao/presenca", label: "Presença", icon: DoorOpen },
        { href: terminalHref, label: "Terminal", external: true, icon: Monitor },
      ],
    },
    {
      label: "Financeiro",
      links: [
        { href: "/balcao/cobranca", label: "Cobrança", icon: CreditCard },
        { href: "/balcao/relatorios", label: "Relatórios", icon: BarChart3 },
      ],
    },
    {
      label: "Gestão",
      links: [
        { href: "/balcao/planos", label: "Planos", icon: Wallet },
        { href: "/balcao/grade", label: "Grade", icon: CalendarDays },
        { href: "/balcao/treinos", label: "Treinos", icon: Dumbbell },
        { href: "/balcao/estoque", label: "Estoque", icon: Package },
      ],
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
          // Selecionado: fundo neutro + barra vermelha; o vermelho cheio fica para a ação principal.
          active
            ? "bg-muted text-foreground font-semibold shadow-[inset_3px_0_0_var(--primary)]"
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
  stoneEnabled,
  onNavigate,
}: {
  isAdmin: boolean;
  tenantSlug: string;
  stoneEnabled: boolean;
  onNavigate?: () => void;
}) {
  const groups = buildGroups(tenantSlug);
  // Sem a integração Stone não há o que configurar em Pagamentos.
  const settingsLinks = stoneEnabled
    ? adminLinks
    : adminLinks.filter((link) => link.href !== "/balcao/configuracoes/pagamentos");

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-4 py-4">
        <VersatilLogo href="/balcao" height={40} />
      </div>

      <nav
        className="flex-1 overflow-y-auto px-3 py-4"
        aria-label="Menu do balcão"
      >
        {groups.map((group, i) => (
          <div key={group.label} className={i === 0 ? undefined : "mt-5"}>
            <p className="mb-1.5 px-3 text-xs font-medium text-muted-foreground">{group.label}</p>
            <NavItems links={group.links} onNavigate={onNavigate} />
          </div>
        ))}
        {isAdmin ? (
          <div className="mt-5">
            <p className="mb-1.5 px-3 text-xs font-medium text-muted-foreground">Configurações</p>
            <NavItems links={settingsLinks} onNavigate={onNavigate} />
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
  stoneEnabled = false,
}: {
  isAdmin?: boolean;
  tenantSlug?: string;
  stoneEnabled?: boolean;
}) {
  const [open, setOpen] = useState(false);

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
          <aside
            className="absolute inset-y-0 left-0 flex w-[min(18rem,85vw)] flex-col border-r border-border bg-card shadow-lg"
            onClick={(event) => {
              if ((event.target as HTMLElement).closest("a")) setOpen(false);
            }}
          >
            <SidebarBody
              isAdmin={isAdmin}
              tenantSlug={tenantSlug}
              stoneEnabled={stoneEnabled}
              onNavigate={() => setOpen(false)}
            />
          </aside>
        </div>
      ) : null}

      {/* Desktop sidebar */}
      <aside className="balcao-nav fixed inset-y-0 left-0 z-30 hidden w-60 border-r border-border bg-card lg:flex lg:flex-col">
        <SidebarBody isAdmin={isAdmin} tenantSlug={tenantSlug} stoneEnabled={stoneEnabled} />
      </aside>
    </>
  );
}
