"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Plan = {
  id: string;
  name: string;
  priceCents: number;
  billingInterval: string;
  active: boolean;
};

type SubRow = {
  subscription: {
    id: string;
    studentId: string;
    planId: string;
    startsAt: string;
    endsAt: string | null;
    active: boolean;
    createdAt: string;
  };
  plan: Plan;
};

async function fetchPlans() {
  const res = await fetch("/api/plans", { credentials: "include" });
  if (!res.ok) throw new Error("Falha ao carregar planos.");
  const j = (await res.json()) as { items: Plan[] };
  return j.items;
}

async function fetchSubs(studentId: string) {
  const res = await fetch(`/api/students/${studentId}/subscriptions`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error("Falha ao carregar assinaturas.");
  const j = (await res.json()) as { items: SubRow[] };
  return j.items;
}

export function StudentSubscriptionsPanel({
  studentId,
}: {
  studentId: string;
}) {
  const qc = useQueryClient();
  const qp = useQuery({ queryKey: ["plans"], queryFn: fetchPlans });
  const qs = useQuery({
    queryKey: ["subscriptions", studentId],
    queryFn: () => fetchSubs(studentId),
  });

  const [planId, setPlanId] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [busy, setBusy] = useState(false);

  async function createSub(e: React.FormEvent) {
    e.preventDefault();
    if (!planId || !startsAt) return;
    setBusy(true);
    try {
      const body: Record<string, string> = {
        planId,
        startsAt: new Date(startsAt).toISOString(),
      };
      if (endsAt) body.endsAt = new Date(endsAt).toISOString();
      const res = await fetch(`/api/students/${studentId}/subscriptions`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) return;
      setPlanId("");
      setStartsAt("");
      setEndsAt("");
      await qc.invalidateQueries({ queryKey: ["subscriptions", studentId] });
    } finally {
      setBusy(false);
    }
  }

  if (qp.isLoading || qs.isLoading) {
    return <p className="text-sm text-muted-foreground">Carregando assinaturas…</p>;
  }
  if (qp.isError || qs.isError) {
    return (
      <p className="text-sm text-red-600">
        {((qp.error ?? qs.error) as Error).message}
      </p>
    );
  }

  const plans = qp.data ?? [];
  const items = qs.data ?? [];

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div>
        <h3 className="text-sm font-medium">Nova assinatura</h3>
        <form
          onSubmit={(e) => void createSub(e)}
          className="mt-2 flex flex-col gap-2"
        >
          <select
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
            value={planId}
            onChange={(e) => setPlanId(e.target.value)}
            required
          >
            <option value="">Selecione o plano</option>
            {plans
              .filter((p) => p.active)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} —{" "}
                  {(p.priceCents / 100).toLocaleString("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  })}{" "}
                  ({p.billingInterval})
                </option>
              ))}
          </select>
          <Input
            type="datetime-local"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
            required
          />
          <Input
            type="datetime-local"
            placeholder="Término (opcional)"
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
          />
          <Button type="submit" size="sm" disabled={busy || plans.length === 0}>
            Associar plano
          </Button>
        </form>
      </div>
      <div>
        <h3 className="text-sm font-medium">Histórico</h3>
        <ul className="mt-2 space-y-2 text-sm">
          {items.length === 0 ? (
            <li className="text-muted-foreground">Nenhuma assinatura.</li>
          ) : (
            items.map(({ subscription: s, plan }) => (
              <li
                key={s.id}
                className="rounded-md border border-border p-2"
              >
                <div className="font-medium">{plan.name}</div>
                <div className="text-xs text-muted-foreground">
                  {new Date(s.startsAt).toLocaleString("pt-BR")}
                  {s.endsAt
                    ? ` → ${new Date(s.endsAt).toLocaleString("pt-BR")}`
                    : ""}
                </div>
                <div className="text-xs capitalize">
                  {s.active ? "ativa" : "inativa"}
                </div>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
