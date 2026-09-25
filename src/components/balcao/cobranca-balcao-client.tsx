"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { FlashMessage } from "@/components/ui/flash-message";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { StoneChargeButton } from "@/components/balcao/stone-charge-button";
import {
  MANUAL_PAYMENT_LABELS,
  MANUAL_PAYMENT_METHODS,
  type ManualPaymentMethod,
} from "@/lib/billing/payment-methods";
import { readApiError } from "@/lib/api/read-error";
import { formatDateBr } from "@/lib/dates/br";
import {
  canSendToPos,
  financeLabel,
  financeSituation,
  manualSettlementBlockReason,
  posLabel,
  posSituation,
} from "@/lib/billing/invoice-situation";
import { invoiceStatusLabel } from "@/lib/labels";

type OpenInvoice = {
  invoiceId: string;
  studentId: string;
  studentName: string;
  amountCents: number;
  currency: string;
  dueAt: string;
  status: string;
  overdue: boolean;
  gatewayChargeStatus?: string | null;
  externalId?: string | null;
  gatewayIdempotencyKey?: string | null;
  lastChargeError?: string | null;
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

type ConflictItem = {
  id: string;
  invoiceId: string;
  invoiceStatus: string;
  studentName: string;
  chargeId: string;
  eventId: string;
  amountCents: number;
  currency: string;
  reason: string;
};

export function CobrancaBalcaoClient({ isAdmin }: { isAdmin: boolean }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["open-invoices"], queryFn: fetchOpen });
  const conflicts = useQuery({
    queryKey: ["payment-conflicts"],
    queryFn: async () => {
      const res = await fetch("/api/billing/payment-conflicts", { credentials: "include" });
      if (!res.ok) throw new Error("Falha ao carregar conciliações.");
      return (await res.json()) as {
        items?: ConflictItem[];
        reviewRequired?: boolean;
      };
    },
  });
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
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
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
      {isAdmin && (conflicts.data?.items?.length ?? 0) > 0 ? (
        <Card>
          <CardContent className="space-y-2 py-4 text-sm">
            <h2 className="font-medium">Conciliação pendente</h2>
            <p className="text-xs text-muted-foreground">
              Somente consulta. Esta tela não quita, estorna nem reativa a assinatura.
            </p>
            <ul className="space-y-2">
              {conflicts.data?.items?.map((item) => (
                <li key={item.id} className="rounded-md border border-border p-2">
                  <div className="font-medium">{item.studentName}</div>
                  <div>
                    {(item.amountCents / 100).toLocaleString("pt-BR", {
                      style: "currency",
                      currency: "BRL",
                    })}
                  </div>
                  <div>
                    {item.invoiceStatus === "void"
                      ? "Fatura anulada"
                      : invoiceStatusLabel(item.invoiceStatus)}
                    . Pendência aberta.
                  </div>
                  <div className="text-xs">{item.reason}</div>
                  <details className="mt-1 text-xs text-muted-foreground">
                    <summary>Detalhes para suporte</summary>
                    <div>Fatura {item.invoiceId}</div>
                    <div>Cobrança {item.chargeId}</div>
                    <div>Evento {item.eventId}</div>
                  </details>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
      {!isAdmin && conflicts.data?.reviewRequired ? (
        <p className="text-sm">
          Pagamento precisa de conferência pelo administrador.
        </p>
      ) : null}
      <Card>
        <CardContent className="pt-5 text-sm text-muted-foreground">
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
        </CardContent>
      </Card>

      {overdue.length > 0 ? (
        <p className="text-sm font-medium text-red-700">
          {overdue.length} fatura(s) vencida(s) — alunos podem estar bloqueados na
          catraca.
        </p>
      ) : null}

      {items.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="Nenhuma fatura em aberto"
          description="Associe planos aos alunos ou gere faturas do período."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="outline" size="sm" asChild>
                <Link href="/balcao/planos">Ver planos</Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link href="/balcao/alunos">Ver alunos</Link>
              </Button>
            </div>
          }
        />
      ) : (
        <ul className="space-y-3">
          {items.map((inv) => {
            const finance = financeSituation(inv.status, inv.dueAt);
            const pos = posSituation(inv);
            const block = manualSettlementBlockReason(pos);
            const posText = posLabel(pos);
            return (
            <li
              key={inv.invoiceId}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-4 text-sm shadow-sm"
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
                  <span className="ml-2 font-medium text-foreground">
                    {financeLabel(finance)}
                  </span>
                  {posText ? (
                    <span className="mt-1 block text-xs">{posText}</span>
                  ) : null}
                  {pos === "refused" && inv.lastChargeError ? (
                    <span className="mt-1 block text-xs">{inv.lastChargeError}</span>
                  ) : null}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Select
                  className="h-9 w-auto"
                  value={methodByInvoice[inv.invoiceId] ?? "stone_card"}
                  onChange={(e) =>
                    setMethodByInvoice((m) => ({
                      ...m,
                      [inv.invoiceId]: e.target.value as ManualPaymentMethod,
                    }))
                  }
                  disabled={Boolean(block)}
                >
                  {MANUAL_PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {MANUAL_PAYMENT_LABELS[m]}
                    </option>
                  ))}
                </Select>
                <Button
                  type="button"
                  size="sm"
                  disabled={busyId === inv.invoiceId || Boolean(block)}
                  onClick={() => void settle(inv)}
                >
                  Registrar pagamento
                </Button>
                {block ? (
                  <p className="w-full text-xs text-muted-foreground">{block}</p>
                ) : null}
                <StoneChargeButton
                  invoiceId={inv.invoiceId}
                  disabledReason={
                    canSendToPos(pos, finance)
                      ? null
                      : block ?? "Esta fatura não pode ser enviada de novo agora."
                  }
                />
              </div>
            </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
