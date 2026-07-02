"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FlashMessage } from "@/components/ui/flash-message";
import {
  MANUAL_PAYMENT_LABELS,
  MANUAL_PAYMENT_METHODS,
  type ManualPaymentMethod,
} from "@/lib/billing/payment-methods";
import { readApiError } from "@/lib/api/read-error";
import { formatDateBr } from "@/lib/dates/br";

type OpenInvoice = {
  invoiceId: string;
  studentId: string;
  studentName: string;
  amountCents: number;
  currency: string;
  dueAt: string;
  status: string;
  overdue: boolean;
};

async function fetchOpen() {
  const res = await fetch("/api/billing/open-invoices", { credentials: "include" });
  if (!res.ok) throw new Error("Falha ao carregar faturas em aberto.");
  return (await res.json()) as { items: OpenInvoice[] };
}

function money(cents: number, currency: string) {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency,
  });
}

export function CobrancaBalcaoClient({ isAdmin }: { isAdmin: boolean }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["open-invoices"], queryFn: fetchOpen });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [genBusy, setGenBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [methodByInvoice, setMethodByInvoice] = useState<
    Record<string, ManualPaymentMethod>
  >({});

  async function settle(inv: OpenInvoice) {
    const paymentMethod = methodByInvoice[inv.invoiceId] ?? "stone_card";
    const label = MANUAL_PAYMENT_LABELS[paymentMethod];
    const amount = money(inv.amountCents, inv.currency);
    if (
      !window.confirm(
        `Confirmar pagamento de ${amount} para ${inv.studentName} via ${label}?`,
      )
    ) {
      return;
    }
    setBusyId(inv.invoiceId);
    setErr(null);
    setMsg(null);
    try {
      const res = await fetch(`/api/invoices/${inv.invoiceId}/settle-manual`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentMethod }),
      });
      if (!res.ok) {
        setErr(await readApiError(res, "Não foi possível registrar o pagamento."));
        return;
      }
      setMsg(`Pagamento registrado para ${inv.studentName}.`);
      await qc.invalidateQueries({ queryKey: ["open-invoices"] });
    } finally {
      setBusyId(null);
    }
  }

  async function generateInvoices() {
    setGenBusy(true);
    setMsg(null);
    setErr(null);
    try {
      const res = await fetch("/api/billing/generate-invoices", {
        method: "POST",
        credentials: "include",
      });
      const j = (await res.json().catch(() => ({}))) as {
        error?: string;
        created?: number;
      };
      if (!res.ok) {
        setErr(j.error ?? "Erro ao gerar faturas.");
        return;
      }
      setMsg(`${j.created ?? 0} fatura(s) criada(s).`);
      await qc.invalidateQueries({ queryKey: ["open-invoices"] });
    } finally {
      setGenBusy(false);
    }
  }

  if (q.isLoading) {
    return <p className="text-sm text-muted-foreground">Carregando…</p>;
  }
  if (q.isError) {
    return <p className="text-sm text-red-600">{(q.error as Error).message}</p>;
  }

  const items = q.data?.items ?? [];
  const overdue = items.filter((i) => i.overdue);

  return (
    <div className="space-y-6">
      <FlashMessage
        error={err}
        success={msg}
        onDismiss={() => {
          setErr(null);
          setMsg(null);
        }}
      />
      <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
        <p>
          Registre aqui quando o aluno pagar na recepção —{" "}
          <strong className="text-foreground">dinheiro, Pix ou cartão Stone</strong>.
          A cobrança recorrente na Stone acontece fora do sistema; após confirmar
          o pagamento, clique em <strong className="text-foreground">Registrar pagamento</strong>.
          Alunos com fatura vencida ficam bloqueados na catraca.
        </p>
        {isAdmin ? (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={genBusy}
              onClick={() => void generateInvoices()}
            >
              Gerar faturas do período
            </Button>
          </div>
        ) : null}
      </div>

      {overdue.length > 0 ? (
        <p className="text-sm font-medium text-red-700">
          {overdue.length} fatura(s) vencida(s) — alunos podem estar bloqueados na
          catraca.
        </p>
      ) : null}

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhuma fatura em aberto. Associe planos aos alunos ou gere faturas do
          período.
        </p>
      ) : (
        <ul className="space-y-3">
          {items.map((inv) => (
            <li
              key={inv.invoiceId}
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3 text-sm"
            >
              <div>
                <Link
                  href={`/balcao/alunos/${inv.studentId}`}
                  className="font-medium text-primary hover:underline"
                >
                  {inv.studentName}
                </Link>
                <div className="text-muted-foreground">
                  {money(inv.amountCents, inv.currency)} · Venc.{" "}
                  {formatDateBr(inv.dueAt)}
                  {inv.overdue ? (
                    <span className="ml-2 font-medium text-red-700">vencida</span>
                  ) : null}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                  value={methodByInvoice[inv.invoiceId] ?? "stone_card"}
                  onChange={(e) =>
                    setMethodByInvoice((m) => ({
                      ...m,
                      [inv.invoiceId]: e.target.value as ManualPaymentMethod,
                    }))
                  }
                >
                  {MANUAL_PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {MANUAL_PAYMENT_LABELS[m]}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  size="sm"
                  disabled={busyId === inv.invoiceId}
                  onClick={() => void settle(inv)}
                >
                  Registrar pagamento
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
