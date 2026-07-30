"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FlashMessage } from "@/components/ui/flash-message";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
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

/** Sugestões rápidas — a academia pode ajustar o nome e o preço. */
const MODALIDADE_SUGESTOES = [
  "Mensal Musculação",
  "Mensal Lutas",
  "Mensal Dança",
  "Mensal Spinning",
  "Mensal CrossFit",
] as const;

async function fetchPlans() {
  const res = await fetch("/api/plans", { credentials: "include" });
  if (!res.ok) throw new Error("Falha ao carregar planos.");
  const j = (await res.json()) as { items: Plan[] };
  return j.items;
}

function money(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function parsePriceToCents(raw: string): number | null {
  const n = Number(raw.replace(",", ".").trim());
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPrice, setEditPrice] = useState("");

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!isAdmin) return;
    const cents = parsePriceToCents(price);
    if (cents === null || !name.trim()) {
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

  function startEdit(p: Plan) {
    setEditingId(p.id);
    setEditName(p.name);
    setEditPrice((p.priceCents / 100).toFixed(2).replace(".", ","));
    setErr(null);
    setSuccess(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditName("");
    setEditPrice("");
  }

  async function saveEdit(planId: string) {
    if (!isAdmin) return;
    const cents = parsePriceToCents(editPrice);
    if (cents === null || !editName.trim()) {
      setErr("Preencha nome e preço válidos.");
      return;
    }
    setBusy(true);
    setErr(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/plans/${planId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName.trim(),
          priceCents: cents,
        }),
      });
      if (!res.ok) {
        setErr(await readApiError(res, "Não foi possível salvar o plano."));
        return;
      }
      setSuccess("Plano atualizado. Novas faturas usam o valor novo.");
      cancelEdit();
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
        <Card>
          <CardContent className="space-y-4 pt-5">
            <div>
              <h2 className="text-lg font-medium">Novo plano</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Crie um plano por modalidade (musculação, lutas, dança…) com o
                valor mensal correspondente. Na ficha do aluno você associa o
                plano certo.
              </p>
            </div>

            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">
                Sugestões rápidas
              </p>
              <div className="flex flex-wrap gap-2">
                {MODALIDADE_SUGESTOES.map((m) => (
                  <Button
                    key={m}
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => setName(m)}
                  >
                    {m.replace(/^Mensal /, "")}
                  </Button>
                ))}
              </div>
            </div>

            <form
              onSubmit={(e) => void create(e)}
              className="grid max-w-xl gap-3 sm:grid-cols-2"
            >
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="plan-name">Nome do plano</Label>
                <Input
                  id="plan-name"
                  placeholder="Ex.: Mensal CrossFit"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="plan-price">Preço (R$)</Label>
                <Input
                  id="plan-price"
                  placeholder="149,90"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="plan-interval">Cobrança</Label>
                <Select
                  id="plan-interval"
                  value={interval}
                  onChange={(e) =>
                    setInterval(e.target.value as BillingInterval)
                  }
                >
                  <option value="monthly">Mensal</option>
                  <option value="semesterly">Semestral</option>
                  <option value="yearly">Anual</option>
                </Select>
              </div>
              <div className="sm:col-span-2">
                <Button type="submit" disabled={busy}>
                  Criar plano
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : (
        <p className="text-sm text-muted-foreground">
          Apenas administradores podem criar ou editar planos. Você pode
          visualizar a lista abaixo.
        </p>
      )}

      <section>
        <h2 className="text-lg font-medium">Planos cadastrados</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Ao alterar o preço, as próximas faturas geradas usam o valor novo.
          Faturas já emitidas não mudam automaticamente.
        </p>
        <ul className="mt-4 space-y-3">
          {items.length === 0 ? (
            <li className="text-sm text-muted-foreground">Nenhum plano.</li>
          ) : (
            items.map((p) => (
              <li
                key={p.id}
                className="rounded-lg border border-border bg-card p-4 text-sm shadow-sm"
              >
                {editingId === p.id ? (
                  <div className="space-y-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor={`edit-name-${p.id}`}>Nome</Label>
                        <Input
                          id={`edit-name-${p.id}`}
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor={`edit-price-${p.id}`}>Preço (R$)</Label>
                        <Input
                          id={`edit-price-${p.id}`}
                          value={editPrice}
                          onChange={(e) => setEditPrice(e.target.value)}
                        />
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {billingIntervalLabel(p.billingInterval)} · não altera o
                      intervalo nesta edição
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        disabled={busy}
                        onClick={() => void saveEdit(p.id)}
                      >
                        Salvar
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={cancelEdit}
                      >
                        Cancelar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-foreground">{p.name}</p>
                      <p className="mt-0.5 text-muted-foreground">
                        <span className="font-semibold tabular-nums text-foreground">
                          {money(p.priceCents)}
                        </span>
                        {" · "}
                        {billingIntervalLabel(p.billingInterval)}
                        {" · "}
                        {p.active ? (
                          <span className="text-emerald-700">ativo</span>
                        ) : (
                          <span className="text-red-700">inativo</span>
                        )}
                      </p>
                    </div>
                    {isAdmin ? (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => startEdit(p)}
                        >
                          Editar valor
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          disabled={busy}
                          onClick={() => void toggleActive(p)}
                        >
                          {p.active ? "Desativar" : "Ativar"}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                )}
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
}
