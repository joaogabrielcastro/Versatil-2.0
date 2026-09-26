"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { BrDateInput } from "@/components/ui/br-date-input";
import { FlashMessage } from "@/components/ui/flash-message";
import { Input } from "@/components/ui/input";
import { readApiError } from "@/lib/api/read-error";
import {
  MANUAL_PAYMENT_LABELS,
  MANUAL_PAYMENT_METHODS,
  type ManualPaymentMethod,
} from "@/lib/billing/payment-methods";
import { formatDateBr, formatDateTimeBr, parseDateBr } from "@/lib/dates/br";
import { timelineEventLabel } from "@/lib/labels";
import { manualPaymentLabel } from "@/lib/billing/payment-methods";
import { StudentMonthHistory } from "@/components/balcao/student-month-history";
import { AutoRenewPanel } from "@/components/balcao/auto-renew-panel";
import { feeAccessLabel } from "@/lib/billing/access-effect";
import {
  financeLabel,
  financeSituation,
  manualSettlementBlockReason,
  posLabel,
  posSituation,
} from "@/lib/billing/invoice-situation";

type Invoice = {
  id: string;
  amountCents: number;
  currency: string;
  status: string;
  dueAt: string;
  paidAt: string | null;
  settlementSource: string | null;
  gatewayChargeStatus?: string | null;
  externalId?: string | null;
  gatewayIdempotencyKey?: string | null;
  lastChargeError?: string | null;
  purpose?: string | null;
  accessEffect?: string | null;
};

type Timeline = {
  id: string;
  invoiceId: string;
  type: string;
  payload: unknown;
  createdAt: string;
};

async function fetchBilling(studentId: string) {
  const res = await fetch(`/api/students/${studentId}/invoices`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error("Falha ao carregar cobrança.");
  return (await res.json()) as { invoices: Invoice[]; timeline: Timeline[] };
}

type FeePlan = {
  id: string;
  name: string;
  priceCents: number;
  active: boolean;
  kind: string;
};

async function fetchPlans() {
  const res = await fetch("/api/plans", { credentials: "include" });
  if (!res.ok) throw new Error("Falha ao carregar taxas.");
  const body = (await res.json()) as { items: FeePlan[] };
  return body.items;
}

export function StudentBillingPanel({ studentId }: { studentId: string }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["billing", studentId],
    queryFn: () => fetchBilling(studentId),
  });
  const plansQ = useQuery({ queryKey: ["plans"], queryFn: fetchPlans });

  const [amount, setAmount] = useState("");
  const [due, setDue] = useState("");
  const [dueError, setDueError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [paymentMethod, setPaymentMethod] =
    useState<ManualPaymentMethod>("stone_card");
  const [err, setErr] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const feeRequestKey = useRef<string | null>(null);

  async function createInvoice(e: React.FormEvent) {
    e.preventDefault();
    setDueError(null);
    setErr(null);
    setSuccess(null);
    const dueDate = parseDateBr(due);
    if (!dueDate) {
      setDueError("Vencimento inválido. Use dd/mm/aaaa ou dd/mm/aaaa HH:mm.");
      return;
    }
    setBusy(true);
    try {
      const cents = Math.round(Number(amount.replace(",", ".")) * 100);
      if (!Number.isFinite(cents) || cents <= 0) {
        setErr("Informe um valor válido.");
        return;
      }
      const res = await fetch("/api/invoices", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId,
          amountCents: cents,
          dueAt: dueDate.toISOString(),
          purpose: "manual",
        }),
      });
      if (!res.ok) {
        setErr(await readApiError(res, "Não foi possível criar a fatura."));
        return;
      }
      setAmount("");
      setDue("");
      setSuccess("Fatura criada com sucesso.");
      await qc.invalidateQueries({ queryKey: ["billing", studentId] });
    } finally {
      setBusy(false);
    }
  }

  async function chargeFee(fee: FeePlan) {
    const value = (fee.priceCents / 100).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
    if (!window.confirm(`Lançar ${fee.name} de ${value} em aberto?`)) return;
    if (!feeRequestKey.current) feeRequestKey.current = crypto.randomUUID();
    const requestKey = feeRequestKey.current;
    setBusy(true);
    setErr(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/invoices", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId,
          amountCents: fee.priceCents,
          dueAt: new Date().toISOString(),
          note: fee.name,
          purpose: "fee",
          planId: fee.id,
          idempotencyKey: `fee:${fee.id}:${requestKey}`,
        }),
      });
      if (!res.ok) {
        setErr(await readApiError(res, "Não foi possível lançar a taxa."));
        return;
      }
      const body = (await res.json()) as { repeated?: boolean };
      feeRequestKey.current = null;
      setSuccess(
        body.repeated
          ? `${fee.name} já tinha sido lançada nesta solicitação.`
          : `${fee.name} lançada em aberto.`,
      );
      await qc.invalidateQueries({ queryKey: ["billing", studentId] });
    } finally {
      setBusy(false);
    }
  }

  async function settle(id: string, amountCents: number, currency: string) {
    const label = MANUAL_PAYMENT_LABELS[paymentMethod];
    const value = (amountCents / 100).toLocaleString("pt-BR", {
      style: "currency",
      currency,
    });
    if (!window.confirm(`Confirmar pagamento de ${value} via ${label}?`)) return;

    setBusy(true);
    setErr(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/invoices/${id}/settle-manual`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentMethod,
          note: note || undefined,
        }),
      });
      if (!res.ok) {
        setErr(await readApiError(res, "Não foi possível registrar o pagamento."));
        return;
      }
      setSuccess("Pagamento registrado.");
      await qc.invalidateQueries({ queryKey: ["billing", studentId] });
      await qc.invalidateQueries({ queryKey: ["open-invoices"] });
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

  const data = q.data!;

  return (
    <div className="grid gap-8 lg:grid-cols-2">
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
      <div className="lg:col-span-2">
        <StudentMonthHistory invoices={data.invoices} />
      </div>
      <div>
        <h3 className="text-sm font-medium">Nova fatura avulsa</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Faturas de plano são geradas automaticamente ao associar assinatura ou
          pelo cron / botão em Cobrança. As taxas abaixo usam o valor da tabela.
        </p>
        {(() => {
          const fees = (plansQ.data ?? []).filter(
            (plan) => plan.kind === "fee" && plan.active,
          );
          if (plansQ.isLoading) return null;
          if (fees.length === 0) {
            return (
              <p className="mt-2 text-xs text-muted-foreground">
                Nenhuma taxa cadastrada. Em Planos, use Carregar tabela Versátil.
              </p>
            );
          }
          return (
            <div className="mt-3 flex flex-wrap gap-2">
              {fees.map((fee) => (
                <Button
                  key={fee.id}
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => void chargeFee(fee)}
                >
                  {fee.name} ·{" "}
                  {(fee.priceCents / 100).toLocaleString("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  })}
                </Button>
              ))}
            </div>
          );
        })()}
        <form
          onSubmit={(e) => void createInvoice(e)}
          className="mt-2 flex flex-col gap-2"
        >
          <Input
            placeholder="Valor (ex: 99.90)"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Vencimento
            <BrDateInput withTime value={due} onChange={setDue} required />
          </label>
          {dueError ? <p className="text-sm text-red-600">{dueError}</p> : null}
          <Button type="submit" size="sm" disabled={busy || !due}>
            Criar fatura em aberto
          </Button>
        </form>

        <h3 className="mt-6 text-sm font-medium">Faturas</h3>
        <ul className="mt-2 space-y-2 text-sm">
          {data.invoices.length === 0 ? (
            <li className="text-muted-foreground">Nenhuma fatura.</li>
          ) : (
            data.invoices.map((inv) => {
              const finance = financeSituation(inv.status, inv.dueAt);
              const pos = posSituation(inv);
              const block = manualSettlementBlockReason(pos);
              const posText = posLabel(pos);
              const canSettle = inv.status === "open" && !block;
              return (
              <li
                key={inv.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-2"
              >
                <div>
                  <span>
                    {(inv.amountCents / 100).toLocaleString("pt-BR", {
                      style: "currency",
                      currency: inv.currency,
                    })}
                  </span>
                  {inv.purpose === "fee" ? (
                    <span className="ml-2 text-xs">
                      Taxa avulsa. {feeAccessLabel(inv.accessEffect)}
                    </span>
                  ) : inv.purpose === "subscription" ? (
                    <span className="ml-2 text-xs">Mensalidade</span>
                  ) : inv.purpose === "manual" ? (
                    <span className="ml-2 text-xs">Avulsa manual</span>
                  ) : null}
                  <span className="ml-2 font-medium">{financeLabel(finance)}</span>
                  {posText ? (
                    <span className="mt-1 block text-xs">{posText}</span>
                  ) : null}
                  {pos === "refused" && inv.lastChargeError ? (
                    <span className="mt-1 block text-xs">{inv.lastChargeError}</span>
                  ) : null}
                  <div className="text-xs text-muted-foreground">
                    Venc.: {formatDateBr(inv.dueAt)}
                    {inv.paidAt ? ` · Pago: ${formatDateBr(inv.paidAt)}` : ""}
                  </div>
                  {block ? (
                    <p className="mt-1 text-xs text-muted-foreground">{block}</p>
                  ) : null}
                </div>
                {inv.status === "open" ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="default"
                    disabled={busy || !canSettle}
                    onClick={() =>
                      void settle(inv.id, inv.amountCents, inv.currency)
                    }
                  >
                    Registrar pagamento
                  </Button>
                ) : null}
              </li>
              );
            })
          )}
        </ul>
      </div>
      <div>
        <h3 className="text-sm font-medium">Forma de pagamento (balcão)</h3>
        <select
          className="mt-2 flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
          value={paymentMethod}
          onChange={(e) =>
            setPaymentMethod(e.target.value as ManualPaymentMethod)
          }
        >
          {MANUAL_PAYMENT_METHODS.map((m) => (
            <option key={m} value={m}>
              {MANUAL_PAYMENT_LABELS[m]}
            </option>
          ))}
        </select>
        <h3 className="mt-4 text-sm font-medium">Nota opcional</h3>
        <Input
          className="mt-2"
          placeholder="Ex.: comprovante Stone #123"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <div className="mt-6">
          <AutoRenewPanel studentId={studentId} />
        </div>
        <h3 className="mt-6 text-sm font-medium">Linha do tempo</h3>
        <ul className="mt-2 max-h-80 space-y-2 overflow-y-auto text-sm">
          {data.timeline.length === 0 ? (
            <li className="text-muted-foreground">Sem eventos.</li>
          ) : (
            data.timeline.map((t) => (
              <li key={t.id} className="rounded-md border border-border/80 p-2">
                <div className="font-medium">{timelineEventLabel(t.type)}</div>
                <div className="text-xs text-muted-foreground">
                  {formatDateTimeBr(t.createdAt)}
                </div>
                <TimelineDetail type={t.type} payload={t.payload} />
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}

function TimelineDetail({
  type,
  payload,
}: {
  type: string;
  payload: unknown;
}) {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  const lines: string[] = [];
  if (typeof p.message === "string") lines.push(p.message);
  if (typeof p.paymentMethod === "string") {
    lines.push(`Forma: ${manualPaymentLabel(p.paymentMethod)}`);
  }
  if (typeof p.note === "string" && p.note) lines.push(String(p.note));
  if (lines.length === 0 && type === "note") return null;
  if (lines.length === 0) return null;
  return (
    <p className="mt-1 text-xs text-muted-foreground">{lines.join(" · ")}</p>
  );
}
