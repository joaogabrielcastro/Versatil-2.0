"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { AppShellHeader } from "@/components/brand/app-shell-header";
import { Button } from "@/components/ui/button";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") ?? "/balcao";

  const [tenantSlug, setTenantSlug] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
        subtitle="Equipe da academia. Informe o slug (ex.: demo) se não estiver no subdomínio."
      />
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Slug da academia</span>
          <input
            className="h-10 rounded-md border border-border bg-transparent px-3"
            value={tenantSlug}
            onChange={(e) => setTenantSlug(e.target.value)}
            placeholder="demo"
            autoComplete="organization"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">E-mail</span>
          <input
            className="h-10 rounded-md border border-border bg-transparent px-3"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="username"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Senha</span>
          <input
            className="h-10 rounded-md border border-border bg-transparent px-3"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
        </label>
        {error ? (
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        ) : null}
        <Button type="submit" disabled={loading}>
          {loading ? "Entrando…" : "Entrar"}
        </Button>
      </form>
      <p className="text-center text-sm text-muted-foreground">
        <Link href="/login/plataforma" className="underline underline-offset-4">
          Acesso plataforma (super admin)
        </Link>
        {" · "}
        <Link href="/" className="underline underline-offset-4">
          Início
        </Link>
      </p>
    </main>
  );
}
