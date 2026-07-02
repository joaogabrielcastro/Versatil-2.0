"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShellHeader } from "@/components/brand/app-shell-header";
import { Button } from "@/components/ui/button";
import { FlashMessage } from "@/components/ui/flash-message";
import { Input } from "@/components/ui/input";

const DEMO = {
  tenantSlug: "demo",
  email: "recep@demo.com",
  password: "demo12345678",
};

type LoginFormProps = {
  /** Slug vindo do subdomínio (ex.: demo.versatil.app) — campo oculto */
  subdomainSlug?: string | null;
  /** Slug inicial de ?slug= ou demo */
  initialSlug?: string;
};

export function LoginForm({ subdomainSlug, initialSlug = "" }: LoginFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") ?? "/balcao";
  const isDemo = searchParams.get("demo") === "1";

  const resolvedSlug = subdomainSlug ?? (isDemo ? DEMO.tenantSlug : initialSlug);
  const slugLocked = Boolean(subdomainSlug || initialSlug || isDemo);

  const [tenantSlug, setTenantSlug] = useState(resolvedSlug);
  const [email, setEmail] = useState(isDemo ? DEMO.email : "");
  const [password, setPassword] = useState(isDemo ? DEMO.password : "");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isDemo) {
      setTenantSlug(DEMO.tenantSlug);
      setEmail(DEMO.email);
      setPassword(DEMO.password);
    } else if (resolvedSlug) {
      setTenantSlug(resolvedSlug);
    }
  }, [isDemo, resolvedSlug]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const slug = (subdomainSlug ?? tenantSlug).trim();
      if (!slug) {
        setError("Informe o identificador da academia.");
        return;
      }
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantSlug: slug,
          email: email.trim(),
          password,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!res.ok) {
        setError(data.error ?? "Falha no login.");
        return;
      }
      router.push(nextPath.startsWith("/") ? nextPath : "/balcao");
      router.refresh();
    } catch {
      setError("Erro de rede. Tente de novo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6 py-12">
      <AppShellHeader
        title="Entrar"
        subtitle="Equipe da academia — após o login você acessa o painel do balcão."
      />
      {isDemo ? (
        <p className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-sm text-foreground">
          Conta de demonstração preenchida. Clique em <strong>Entrar</strong>.
        </p>
      ) : null}
      {slugLocked && resolvedSlug ? (
        <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-foreground">
          Academia: <strong>{resolvedSlug}</strong>
          {subdomainSlug ? (
            <span className="mt-1 block text-xs text-muted-foreground">
              Identificada automaticamente pelo endereço do site.
            </span>
          ) : null}
        </p>
      ) : null}
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        {!slugLocked ? (
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Identificador da academia</span>
            <Input
              value={tenantSlug}
              onChange={(e) => setTenantSlug(e.target.value)}
              placeholder="demo"
              autoComplete="organization"
              required
            />
            <span className="text-xs text-muted-foreground">
              Código informado pelo administrador (ex.: <code>demo</code>).
            </span>
          </label>
        ) : null}
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">E-mail</span>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="username"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Senha</span>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
        </label>
        <FlashMessage error={error} onDismiss={() => setError(null)} />
        <Button type="submit" disabled={loading}>
          {loading ? "Entrando…" : "Entrar"}
        </Button>
      </form>
      <p className="text-center text-sm text-muted-foreground">
        <Link href="/login?demo=1" className="underline underline-offset-4">
          Usar conta demo
        </Link>
        {" · "}
        <Link href="/" className="underline underline-offset-4">
          Início
        </Link>
      </p>
    </main>
  );
}
