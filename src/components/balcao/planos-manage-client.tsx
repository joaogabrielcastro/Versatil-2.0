"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FlashMessage } from "@/components/ui/flash-message";
import { Input } from "@/components/ui/input";
import { readApiError } from "@/lib/api/read-error";
import {
  type BillingInterval,
  billingIntervalLabel,
} from "@/lib/billing/interval-labels";

type Plan = {
  id: string;
  name: string;
  priceCents: number;
  billingInterval: string;
  active: boolean;
};

async function fetchPlans() {
  const res = await fetch("/api/plans", { credentials: "include" });
  if (!res.ok) throw new Error("Falha ao carregar planos.");
  const j = (await res.json()) as { items: Plan[] };
  return j.items;
}

export function PlanosManageClient({ isAdmin }: { isAdmin: boolean }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["plans"], queryFn: fetchPlans });
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [interval, setInterval] = useState<BillingInterval>("monthly");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!isAdmin) return;
    const cents = Math.round(Number(price.replace(",", ".")) * 100);
    if (!Number.isFinite(cents) || cents < 0 || !name.trim()) {
      setErr("Preencha nome e preço válidos.");
      return;
    }
    setBusy(true);
    setErr(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/plans", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          priceCents: cents,
          billingInterval: interval,
        }),
      });
      if (!res.ok) {
        setErr(await readApiError(res, "Não foi possível criar o plano."));
        return;
      }
      setName("");
      setPrice("");
      setSuccess("Plano criado.");
      await qc.invalidateQueries({ queryKey: ["plans"] });
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(p: Plan) {
    if (!isAdmin) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/plans/${p.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !p.active }),
      });
      if (!res.ok) {
        setErr(await readApiError(res, "Não foi possível atualizar o plano."));
        return;
      }
      await qc.invalidateQueries({ queryKey: ["plans"] });
    } finally {
      setBusy(false);
    }
  }

  if (q.isLoading) {
    return <p className="text-sm text-muted-foreground">Carregando…</p>;
  }
  if (q.isError) {
    return <p className="text-sm text-red-600">{(q.error as Error).message}</p>;
  }

  const items = q.data ?? [];

  return (
    <div className="space-y-8">
      <FlashMessage
        error={err}
        success={success}
        onDismiss={() => {
          setErr(null);
          setSuccess(null);
        }}
      />
      {isAdmin ? (
        <section>
          <h2 className="text-lg font-medium">Novo plano</h2>
          <form
            onSubmit={(e) => void create(e)}
            className="mt-3 flex max-w-md flex-col gap-2"
          >
            <Input
              placeholder="Nome"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Input
              placeholder="Preço (ex: 149.90)"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
            <select
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
              value={interval}
              onChange={(e) =>
                setInterval(e.target.value as BillingInterval)
              }
            >
              <option value="monthly">Mensal</option>
              <option value="semesterly">Semestral</option>
              <option value="yearly">Anual</option>
            </select>
            <Button type="submit" size="sm" disabled={busy}>
              Criar plano
            </Button>
          </form>
        </section>
      ) : (
        <p className="text-sm text-muted-foreground">
          Apenas administradores podem criar ou desativar planos.
        </p>
      )}

      <section>
        <h2 className="text-lg font-medium">Planos cadastrados</h2>
        <ul className="mt-3 space-y-2">
          {items.length === 0 ? (
            <li className="text-sm text-muted-foreground">Nenhum plano.</li>
          ) : (
            items.map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3 text-sm"
              >
                <div>
                  <span className="font-medium">{p.name}</span>
                  <span className="ml-2 text-muted-foreground">
                    {(p.priceCents / 100).toLocaleString("pt-BR", {
                      style: "currency",
                      currency: "BRL",
                    })}
                  </span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {billingIntervalLabel(p.billingInterval)} ·{" "}
                    {p.active ? "ativo" : "inativo"}
                  </span>
                </div>
                {isAdmin ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void toggleActive(p)}
                  >
                    {p.active ? "Desativar" : "Ativar"}
                  </Button>
                ) : null}
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
}
