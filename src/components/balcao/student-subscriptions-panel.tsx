"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { BrDateInput } from "@/components/ui/br-date-input";
import { FlashMessage } from "@/components/ui/flash-message";
import { readApiError } from "@/lib/api/read-error";
import { formatDateTimeBr, formatDateTimeInputBr, parseDateBr } from "@/lib/dates/br";
import {
  billingIntervalLabel,
  isBillingInterval,
} from "@/lib/billing/interval-labels";
import { suggestedSubscriptionEnd } from "@/lib/billing/term-end";
import {
  groupPlansByCategory,
  planChargeLabel,
} from "@/lib/catalog/versatil-table";

type Plan = {
  id: string;
  name: string;
  priceCents: number;
  billingInterval: string;
  active: boolean;
  category: string | null;
  kind: string;
  termMonths: number | null;
};

type Term = {
  id: string;
  source: string;
  planId: string;
  priceCents: number;
  billingInterval: string;
  startsAt: string;
  endsAt: string | null;
  note: string | null;
};

type Subscription = {
  id: string;
  studentId: string;
  planId: string;
  startsAt: string;
  endsAt: string | null;
  active: boolean;
  createdAt: string;
  priceCents: number;
  billingInterval: string;
  cancelRequestedAt: string | null;
  cancelEffectiveAt: string | null;
  cancelReason: string | null;
  scheduledPlanId: string | null;
  scheduledPriceCents: number | null;
  scheduledBillingInterval: string | null;
  scheduledEffectiveAt: string | null;
};

type SubRow = {
  subscription: Subscription;
  plan: Plan;
  terms: Term[];
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

function money(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function contractPhase(s: Subscription, now = new Date()) {
  const start = new Date(s.startsAt).getTime();
  const end = s.endsAt ? new Date(s.endsAt).getTime() : null;
  const effective = s.cancelEffectiveAt ? new Date(s.cancelEffectiveAt).getTime() : null;
  const t = now.getTime();
  if (s.cancelRequestedAt && (!s.active || (effective != null && effective <= t))) {
    return "cancelado" as const;
  }
  if (start > t) return "agendado" as const;
  if (!s.active || (end != null && end < t)) return "encerrado" as const;
  return "vigente" as const;
}

export function StudentSubscriptionsPanel({
  studentId,
  isAdmin = false,
}: {
  studentId: string;
  isAdmin?: boolean;
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
  const subscriptionPlans = plans.filter(
    (plan) => plan.active && plan.kind !== "fee",
  );

  function fillEnd(nextPlanId: string, nextStart: string) {
    const plan = plans.find((item) => item.id === nextPlanId);
    if (!plan || !isBillingInterval(plan.billingInterval)) return;
    if (!nextStart.trim()) {
      setEndsAt("");
      return;
    }
    const start = parseDateBr(nextStart);
    if (!start) return;
    const end = suggestedSubscriptionEnd(start, plan.billingInterval, plan.termMonths);
    setEndsAt(end ? formatDateTimeInputBr(end) : "");
  }

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
            onChange={(e) => {
              const next = e.target.value;
              setPlanId(next);
              fillEnd(next, startsAt);
            }}
            required
          >
            <option value="">Selecione o plano</option>
            {groupPlansByCategory(subscriptionPlans).map(([category, group]) => (
              <optgroup key={category} label={category}>
                {group.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {money(p.priceCents)} ({planChargeLabel(p)})
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <label className="text-xs text-muted-foreground">
            Início (dd/mm/aaaa HH:mm)
            <BrDateInput
              withTime
              className="mt-1"
              value={startsAt}
              onChange={(value) => {
                setStartsAt(value);
                if (planId) fillEnd(planId, value);
              }}
              required
            />
          </label>
          <label className="text-xs text-muted-foreground">
            Término opcional (dd/mm/aaaa HH:mm)
            <BrDateInput withTime className="mt-1" value={endsAt} onChange={setEndsAt} />
            {planId && plans.find((plan) => plan.id === planId)?.termMonths ? (
              <span className="mt-1 block">
                Preenchido pelo prazo do plano. Ajuste se o contrato for diferente.
              </span>
            ) : null}
          </label>
          {dateError ? <p className="text-sm text-red-600">{dateError}</p> : null}
          <Button type="submit" size="sm" disabled={busy || subscriptionPlans.length === 0}>
            Associar plano
          </Button>
        </form>
        {isAdmin ? (
          <>
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
                {groupPlansByCategory(subscriptionPlans).map(([category, group]) => (
                  <optgroup key={category} label={category}>
                    {group.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
            <label className="mt-2 block text-xs text-muted-foreground">
              Novo fim da renovação
              <BrDateInput withTime className="mt-1" value={renewEnd} onChange={setRenewEnd} />
            </label>
          </>
        ) : (
          <p className="mt-3 text-xs text-muted-foreground">
            Cancelar, trocar e renovar são ações do administrador.
          </p>
        )}
      </div>
      <div>
        <h3 className="text-sm font-medium">Contratos</h3>
        <ul className="mt-2 space-y-2 text-sm">
          {items.length === 0 ? (
            <li className="text-muted-foreground">Nenhuma assinatura.</li>
          ) : (
            items.map(({ subscription: s, plan, terms }) => {
              const phase = contractPhase(s);
              const phaseLabel = {
                vigente: "Vigente hoje",
                agendado: "Ainda não começou",
                encerrado: "Contrato encerrado",
                cancelado: "Contrato cancelado",
              }[phase];
              const scheduled = s.scheduledPlanId
                ? plans.find((p) => p.id === s.scheduledPlanId)
                : undefined;
              const canCancel =
                (phase === "vigente" || phase === "agendado") && !s.cancelRequestedAt;
              const canChange = phase === "vigente" && !s.cancelRequestedAt;
              const canRenew = !s.cancelRequestedAt && Boolean(s.endsAt);
              const futureRenewals = (terms ?? []).filter(
                (term) =>
                  term.source === "renewal" &&
                  new Date(term.startsAt).getTime() > Date.now(),
              );
              return (
                <li key={s.id} className="rounded-md border border-border p-2">
                  <div className="font-medium">{plan.name}</div>
                  <div className="text-xs font-medium text-foreground">{phaseLabel}</div>
                  <div className="text-xs text-muted-foreground">
                    Condições vigentes: {money(s.priceCents)} (
                    {billingIntervalLabel(s.billingInterval)})
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Vigência: {formatDateTimeBr(s.startsAt)}
                    {s.endsAt ? ` → ${formatDateTimeBr(s.endsAt)}` : " → sem data final"}
                  </div>
                  {s.cancelRequestedAt ? (
                    <div className="mt-1 text-xs">
                      Cancelamento agendado. Acesso até{" "}
                      {s.cancelEffectiveAt
                        ? formatDateTimeBr(s.cancelEffectiveAt)
                        : "a data registrada"}
                      .
                      {s.cancelReason ? ` Motivo: ${s.cancelReason}.` : ""}
                    </div>
                  ) : null}
                  {s.scheduledPlanId && s.scheduledEffectiveAt ? (
                    <div className="mt-1 text-xs">
                      Troca agendada, ainda não vale hoje:{" "}
                      {scheduled?.name ?? "novo plano"} por{" "}
                      {s.scheduledPriceCents != null
                        ? money(s.scheduledPriceCents)
                        : "o valor registrado"}{" "}
                      (
                      {billingIntervalLabel(
                        s.scheduledBillingInterval ?? scheduled?.billingInterval ?? "",
                      )}
                      ), a partir de {formatDateTimeBr(s.scheduledEffectiveAt)}.
                    </div>
                  ) : null}
                  {futureRenewals.map((term) => (
                    <div key={term.id} className="mt-1 text-xs">
                      Renovação futura, separada do contrato vigente:{" "}
                      {money(term.priceCents)} (
                      {billingIntervalLabel(term.billingInterval)}) de{" "}
                      {formatDateTimeBr(term.startsAt)}
                      {term.endsAt ? ` até ${formatDateTimeBr(term.endsAt)}` : ""}.
                    </div>
                  ))}
                  {s.cancelRequestedAt ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Contrato cancelado não pode ser renovado.
                    </p>
                  ) : null}
                  {phase === "encerrado" && isAdmin ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      O prazo acabou. Dá para renovar; cancelar ou trocar não se aplicam.
                    </p>
                  ) : null}
                  {isAdmin ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {canCancel ? (
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
                              await qc.invalidateQueries({
                                queryKey: ["subscriptions", studentId],
                              });
                            })()
                          }
                        >
                          Cancelar
                        </Button>
                      ) : null}
                      {canChange ? (
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
                                setErr(
                                  await readApiError(res, "Não foi possível agendar a troca."),
                                );
                                return;
                              }
                              setSuccess("Troca agendada para o próximo ciclo.");
                              await qc.invalidateQueries({
                                queryKey: ["subscriptions", studentId],
                              });
                            })()
                          }
                        >
                          Agendar troca
                        </Button>
                      ) : null}
                      {s.scheduledPlanId ? (
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
                                setErr(
                                  await readApiError(res, "Não foi possível desfazer a troca."),
                                );
                                return;
                              }
                              setSuccess("Troca agendada removida.");
                              await qc.invalidateQueries({
                                queryKey: ["subscriptions", studentId],
                              });
                            })()
                          }
                        >
                          Desistir da troca
                        </Button>
                      ) : null}
                      {canRenew ? (
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
                              setSuccess("Renovação futura registrada.");
                              await qc.invalidateQueries({
                                queryKey: ["subscriptions", studentId],
                              });
                            })()
                          }
                        >
                          Renovar prazo
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              );
            })
          )}
        </ul>
      </div>
    </div>
  );
}
