"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { BrDateInput } from "@/components/ui/br-date-input";
import { Input } from "@/components/ui/input";
import {
  MANUAL_PAYMENT_LABELS,
  MANUAL_PAYMENT_METHODS,
  type ManualPaymentMethod,
} from "@/lib/billing/payment-methods";
import { formatDateBr, formatDateTimeBr, parseDateBr } from "@/lib/dates/br";

type Invoice = {
  id: string;
  amountCents: number;
  currency: string;
  status: string;
  dueAt: string;
  paidAt: string | null;
  settlementSource: string | null;
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

export function StudentBillingPanel({ studentId }: { studentId: string }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["billing", studentId],
    queryFn: () => fetchBilling(studentId),
  });

  const [amount, setAmount] = useState("");
  const [due, setDue] = useState("");
  const [dueError, setDueError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [paymentMethod, setPaymentMethod] =
    useState<ManualPaymentMethod>("stone_card");

  async function createInvoice(e: React.FormEvent) {
    e.preventDefault();
    setDueError(null);
    const dueDate = parseDateBr(due);
    if (!dueDate) {
      setDueError("Vencimento inválido. Use dd/mm/aaaa ou dd/mm/aaaa HH:mm.");
      return;
    }
    setBusy(true);
    try {
      const cents = Math.round(Number(amount.replace(",", ".")) * 100);
      if (!Number.isFinite(cents) || cents <= 0) return;
      const res = await fetch("/api/invoices", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId,
          amountCents: cents,
          dueAt: dueDate.toISOString(),
        }),
      });
      if (!res.ok) return;
      setAmount("");
      setDue("");
      await qc.invalidateQueries({ queryKey: ["billing", studentId] });
    } finally {
      setBusy(false);
    }
  }

  async function settle(id: string) {
    setBusy(true);
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
      if (!res.ok) return;
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
      <div>
        <h3 className="text-sm font-medium">Nova fatura avulsa</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Faturas de plano são geradas automaticamente ao associar assinatura ou
          pelo cron / botão em Cobrança.
        </p>
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
            data.invoices.map((inv) => (
              <li
                key={inv.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-2"
              >
                <div>
                  <span className="font-mono text-xs">{inv.id.slice(0, 8)}…</span>
                  <span className="ml-2">
                    {(inv.amountCents / 100).toLocaleString("pt-BR", {
                      style: "currency",
                      currency: inv.currency,
                    })}
                  </span>
                  <span className="ml-2 capitalize text-muted-foreground">
                    {inv.status}
                  </span>
                  <div className="text-xs text-muted-foreground">
                    Venc.: {formatDateBr(inv.dueAt)}
                    {inv.paidAt ? ` · Pago: ${formatDateBr(inv.paidAt)}` : ""}
                  </div>
                </div>
                {inv.status === "open" ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="default"
                    disabled={busy}
                    onClick={() => void settle(inv.id)}
                  >
                    Registrar pagamento
                  </Button>
                ) : null}
              </li>
            ))
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
        <h3 className="mt-6 text-sm font-medium">Linha do tempo</h3>
        <ul className="mt-2 max-h-80 space-y-2 overflow-y-auto text-sm">
          {data.timeline.length === 0 ? (
            <li className="text-muted-foreground">Sem eventos.</li>
          ) : (
            data.timeline.map((t) => (
              <li key={t.id} className="rounded-md border border-border/80 p-2">
                <div className="font-medium">{t.type}</div>
                <div className="text-xs text-muted-foreground">
                  {formatDateTimeBr(t.createdAt)}
                </div>
                <pre className="mt-1 max-h-24 overflow-auto text-xs">
                  {JSON.stringify(t.payload, null, 2)}
                </pre>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
