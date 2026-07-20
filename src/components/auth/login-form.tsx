"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { AppShellHeader } from "@/components/brand/app-shell-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FlashMessage } from "@/components/ui/flash-message";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const DEMO = {
  tenantSlug: "demo",
  email: "recep@demo.com",
  password: "demo12345678",
};

type LoginFormProps = {
  subdomainSlug?: string | null;
  initialSlug?: string;
};

export function LoginForm({ subdomainSlug, initialSlug = "" }: LoginFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") ?? "/balcao";
  const isDemo = searchParams.get("demo") === "1";

  // ?demo=1 sempre usa a academia "demo", mesmo se o domínio principal
  // (ex.: versatil.jwsoftware.com.br) tiver sido lido por engano como slug.
  const resolvedSlug = isDemo
    ? DEMO.tenantSlug
    : (subdomainSlug ?? initialSlug);
  const slugLocked = Boolean(isDemo || subdomainSlug || initialSlug);

  const [tenantSlug, setTenantSlug] = useState(resolvedSlug);
  const [email, setEmail] = useState(isDemo ? DEMO.email : "");
  const [password, setPassword] = useState(isDemo ? DEMO.password : "");
  const [showPassword, setShowPassword] = useState(false);
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
      const slug = (isDemo ? DEMO.tenantSlug : (subdomainSlug ?? tenantSlug)).trim();
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

      <Card>
        <CardContent className="space-y-4 pt-6">
          {isDemo ? (
            <p className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-sm text-foreground">
              Conta de demonstração preenchida. Clique em <strong>Entrar</strong>.
            </p>
          ) : null}
          {slugLocked && resolvedSlug ? (
            <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-foreground">
              Academia: <strong>{resolvedSlug}</strong>
              {subdomainSlug && !isDemo ? (
                <span className="mt-1 block text-xs text-muted-foreground">
                  Identificada automaticamente pelo endereço do site.
                </span>
              ) : null}
            </p>
          ) : null}

          <form onSubmit={onSubmit} className="flex flex-col gap-4" aria-busy={loading}>
            {!slugLocked ? (
              <div className="space-y-1.5">
                <Label htmlFor="tenant-slug">Identificador da academia</Label>
                <Input
                  id="tenant-slug"
                  value={tenantSlug}
                  onChange={(e) => setTenantSlug(e.target.value)}
                  placeholder="demo"
                  autoComplete="organization"
                  autoFocus
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Código informado pelo administrador (ex.: demo).
                </p>
              </div>
            ) : null}
            <div className="space-y-1.5">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoFocus={slugLocked}
                required
                autoComplete="username"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Senha</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="pr-10"
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                >
                  {showPassword ? (
                    <EyeOff className="size-4" />
                  ) : (
                    <Eye className="size-4" />
                  )}
                </button>
              </div>
            </div>
            <FlashMessage error={error} onDismiss={() => setError(null)} />
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "Entrando…" : "Entrar"}
            </Button>
          </form>
        </CardContent>
      </Card>

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
