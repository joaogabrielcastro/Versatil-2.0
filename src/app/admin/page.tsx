"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import Link from "next/link";
import { VersatilLogo } from "@/components/brand/versatil-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

async function fetchTenants() {
  const res = await fetch("/api/admin/tenants", { credentials: "include" });
  if (!res.ok) throw new Error("Sem permissão ou não autenticado.");
  return (await res.json()) as {
    items: { id: string; name: string; slug: string; createdAt: string }[];
  };
}

export default function AdminPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin-tenants"], queryFn: fetchTenants });
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function createTenant(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/tenants", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), slug: slug.trim().toLowerCase() }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setMsg(data.error ?? "Erro.");
        return;
      }
      setName("");
      setSlug("");
      await qc.invalidateQueries({ queryKey: ["admin-tenants"] });
      setMsg("Tenant criado.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <div className="mb-8">
        <VersatilLogo href="/" height={48} />
      </div>
      <p className="text-sm text-muted-foreground">Super admin</p>
      <h1 className="text-2xl font-semibold tracking-tight">Tenants</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Faça login em{" "}
        <Link className="underline" href="/login/plataforma">
          /login/plataforma
        </Link>{" "}
        antes de acessar esta página.
      </p>

      <section className="mt-8">
        <h2 className="text-sm font-medium">Novo tenant</h2>
        <form onSubmit={(e) => void createTenant(e)} className="mt-2 flex max-w-md flex-col gap-2">
          <Input placeholder="Nome da academia" value={name} onChange={(e) => setName(e.target.value)} required />
          <Input placeholder="slug (ex: nova-unidade)" value={slug} onChange={(e) => setSlug(e.target.value)} required />
          {msg ? <p className="text-sm text-muted-foreground">{msg}</p> : null}
          <Button type="submit" disabled={busy}>
            Criar
          </Button>
        </form>
      </section>

      <section className="mt-10">
        <h2 className="text-sm font-medium">Lista</h2>
        {q.isLoading ? (
          <p className="mt-2 text-sm text-muted-foreground">Carregando…</p>
        ) : q.isError ? (
          <p className="mt-2 text-sm text-red-600">{(q.error as Error).message}</p>
        ) : (
          <ul className="mt-2 space-y-2 text-sm">
            {q.data!.items.map((t) => (
              <li key={t.id} className="rounded-md border border-border p-3">
                <span className="font-medium">{t.name}</span>{" "}
                <span className="text-muted-foreground">({t.slug})</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
