"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { AppShellHeader } from "@/components/brand/app-shell-header";
import { Button } from "@/components/ui/button";

export default function PlatformLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/platform/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!res.ok) {
        setError(data.error ?? "Falha no login.");
        return;
      }
      router.push("/");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6 py-12">
      <AppShellHeader
        title="Plataforma (super admin)"
        subtitle="Acesso ao dono do SaaS. Após o login, use APIs e ferramentas internas (painel admin em evolução)."
      />
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
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
        <Link href="/login" className="underline underline-offset-4">
          Voltar ao login da academia
        </Link>
      </p>
    </main>
  );
}
