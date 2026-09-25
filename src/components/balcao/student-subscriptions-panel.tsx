"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { BrDateInput } from "@/components/ui/br-date-input";
import { FlashMessage } from "@/components/ui/flash-message";
import { readApiError } from "@/lib/api/read-error";
import { formatDateTimeBr, parseDateBr } from "@/lib/dates/br";
import { billingIntervalLabel } from "@/lib/billing/interval-labels";

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
  const [dateError, setDateError] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [renewEnd, setRenewEnd] = useState("");
  const [changePlanId, setChangePlanId] = useState("");

  async function createSub(e: React.FormEvent) {
    e.preventDefault();
    setDateError(null);
    if (!planId || !startsAt) return;
    const start = parseDateBr(startsAt);
    if (!start) {
      setDateError("Início inválido. Use dd/mm/aaaa HH:mm.");
      return;
    }
    let end: Date | null = null;
    if (endsAt.trim()) {
      end = parseDateBr(endsAt);
      if (!end) {
        setDateError("Término inválido. Use dd/mm/aaaa HH:mm.");
        return;
      }
    }
    setBusy(true);
    setErr(null);
    setSuccess(null);
    try {
      const body: Record<string, string> = {
        planId,
        startsAt: start.toISOString(),
      };
      if (end) body.endsAt = end.toISOString();
      const res = await fetch(`/api/students/${studentId}/subscriptions`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setErr(await readApiError(res, "Não foi possível associar o plano."));
        return;
      }
      setPlanId("");
      setStartsAt("");
      setEndsAt("");
      setSuccess("Plano associado ao aluno.");
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
      <div className="lg:col-span-2">
        <FlashMessage
          error={err}
          success={success}
          onDismiss={() => {
            setErr(null);
            setSuccess(null);
          }}
        />
      </div>
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
                  ({billingIntervalLabel(p.billingInterval)})
                </option>
              ))}
          </select>
          <label className="text-xs text-muted-foreground">
            Início (dd/mm/aaaa HH:mm)
            <BrDateInput
              withTime
              className="mt-1"
              value={startsAt}
              onChange={setStartsAt}
              required
            />
          </label>
          <label className="text-xs text-muted-foreground">
            Término opcional (dd/mm/aaaa HH:mm)
            <BrDateInput withTime className="mt-1" value={endsAt} onChange={setEndsAt} />
          </label>
          {dateError ? <p className="text-sm text-red-600">{dateError}</p> : null}
          <Button type="submit" size="sm" disabled={busy || plans.length === 0}>
            Associar plano
          </Button>
        </form>
        <label className="mt-3 block text-xs text-muted-foreground">
          Motivo do cancelamento
          <input
            className="mt-1 w-full rounded-md border border-border px-2 py-1 text-sm"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        <label className="mt-2 block text-xs text-muted-foreground">
          Plano da troca no próximo ciclo
          <select
            className="mt-1 w-full rounded-md border border-border px-2 py-1 text-sm"
            value={changePlanId}
            onChange={(e) => setChangePlanId(e.target.value)}
          >
            <option value="">Selecione</option>
            {plans.filter((p) => p.active).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="mt-2 block text-xs text-muted-foreground">
          Novo fim da vigência
          <BrDateInput withTime className="mt-1" value={renewEnd} onChange={setRenewEnd} />
        </label>
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
                  {formatDateTimeBr(s.startsAt)}
                  {s.endsAt ? ` → ${formatDateTimeBr(s.endsAt)}` : ""}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy || reason.trim().length < 3}
                    onClick={() =>
                      void (async () => {
                        setBusy(true);
                        setErr(null);
                        const res = await fetch(
                          `/api/students/${studentId}/subscriptions/${s.id}/cancel`,
                          {
                            method: "POST",
                            credentials: "include",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ reason }),
                          },
                        );
                        setBusy(false);
                        if (!res.ok) {
                          setErr(await readApiError(res, "Não foi possível cancelar."));
                          return;
                        }
                        setSuccess("Cancelamento registrado.");
                        await qc.invalidateQueries({ queryKey: ["subscriptions", studentId] });
                      })()
                    }
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy || !changePlanId}
                    onClick={() =>
                      void (async () => {
                        setBusy(true);
                        setErr(null);
                        const res = await fetch(
                          `/api/students/${studentId}/subscriptions/${s.id}/plan-change`,
                          {
                            method: "POST",
                            credentials: "include",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ planId: changePlanId }),
                          },
                        );
                        setBusy(false);
                        if (!res.ok) {
                          setErr(await readApiError(res, "Não foi possível agendar a troca."));
                          return;
                        }
                        setSuccess("Troca agendada para o próximo ciclo.");
                        await qc.invalidateQueries({ queryKey: ["subscriptions", studentId] });
                      })()
                    }
                  >
                    Agendar troca
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() =>
                      void (async () => {
                        setBusy(true);
                        const res = await fetch(
                          `/api/students/${studentId}/subscriptions/${s.id}/plan-change`,
                          { method: "DELETE", credentials: "include" },
                        );
                        setBusy(false);
                        if (!res.ok) {
                          setErr(await readApiError(res, "Não foi possível desfazer a troca."));
                          return;
                        }
                        setSuccess("Troca agendada removida.");
                        await qc.invalidateQueries({ queryKey: ["subscriptions", studentId] });
                      })()
                    }
                  >
                    Desistir da troca
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      void (async () => {
                        const end = parseDateBr(renewEnd);
                        if (!end) {
                          setDateError("Informe o novo fim da vigência.");
                          return;
                        }
                        setBusy(true);
                        const res = await fetch(
                          `/api/students/${studentId}/subscriptions/${s.id}/renew`,
                          {
                            method: "POST",
                            credentials: "include",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ endsAt: end.toISOString() }),
                          },
                        );
                        setBusy(false);
                        if (!res.ok) {
                          setErr(await readApiError(res, "Não foi possível renovar."));
                          return;
                        }
                        setSuccess("Vigência renovada.");
                        await qc.invalidateQueries({ queryKey: ["subscriptions", studentId] });
                      })()
                    }
                  >
                    Renovar prazo
                  </Button>
                </div>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
