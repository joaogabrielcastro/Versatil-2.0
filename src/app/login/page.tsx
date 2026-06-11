"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShellHeader } from "@/components/brand/app-shell-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const DEMO = {
  tenantSlug: "demo",
  email: "recep@demo.com",
  password: "demo12345678",
};

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") ?? "/balcao";
  const isDemo = searchParams.get("demo") === "1";

  const [tenantSlug, setTenantSlug] = useState(isDemo ? DEMO.tenantSlug : "");
  const [email, setEmail] = useState(isDemo ? DEMO.email : "");
  const [password, setPassword] = useState(isDemo ? DEMO.password : "");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isDemo) {
      setTenantSlug(DEMO.tenantSlug);
      setEmail(DEMO.email);
      setPassword(DEMO.password);
    }
  }, [isDemo]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantSlug: tenantSlug.trim() || undefined,
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
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Slug da academia</span>
          <Input
            value={tenantSlug}
            onChange={(e) => setTenantSlug(e.target.value)}
            placeholder="demo"
            autoComplete="organization"
          />
        </label>
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
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
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
