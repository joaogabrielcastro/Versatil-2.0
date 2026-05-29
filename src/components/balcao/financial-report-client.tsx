"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { ReportsDateRange } from "@/components/balcao/reports-date-range";
import { Button } from "@/components/ui/button";
import { downloadCsv, formatMoneyCsv } from "@/lib/reports/csv";
import { formatDateBr, formatIsoDateBr, toIsoDateInTz } from "@/lib/dates/br";

type FinancialReport = {
  from: string;
  to: string;
  summary: {
    receivedCents: number;
    paidCount: number;
    openCents: number;
    openCount: number;
    overdueCents: number;
    overdueCount: number;
    studentsActive: number;
    studentsDelinquent: number;
    studentsInactive: number;
  };
  paidInPeriod: {
    invoiceId: string;
    studentId: string;
    studentName: string;
    amountCents: number;
    paidAt: string;
    settlementSource: string | null;
  }[];
  overdueOpen: {
    invoiceId: string;
    studentId: string;
    studentName: string;
    amountCents: number;
    dueAt: string;
  }[];
};

function money(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function settlementLabel(s: string | null) {
  if (s === "automatic_gateway") return "Online";
  if (s === "manual_reception") return "Balcão";
  return "—";
}

async function fetchFinancial(from: string, to: string) {
  const res = await fetch(
    `/api/reports/financial?from=${from}&to=${to}`,
    { credentials: "include" },
  );
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(j.error ?? "Falha ao carregar relatório financeiro.");
  }
  return res.json() as Promise<FinancialReport>;
}

function defaultRange() {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 30);
  const fromIso = toIsoDateInTz(from);
  const toIso = toIsoDateInTz(to);
  return { fromIso, toIso };
}

function initialRangeInputs() {
  const { fromIso, toIso } = defaultRange();
  return { fromIso, toIso, fromInput: formatIsoDateBr(fromIso), toInput: formatIsoDateBr(toIso) };
}

export function FinancialReportClient() {
  const init = initialRangeInputs();
  const [fromIso, setFromIso] = useState(init.fromIso);
  const [toIso, setToIso] = useState(init.toIso);
  const [fromInput, setFromInput] = useState(init.fromInput);
  const [toInput, setToInput] = useState(init.toInput);

  const q = useQuery({
    queryKey: ["report-financial", fromIso, toIso],
    queryFn: () => fetchFinancial(fromIso, toIso),
  });

  function exportPaidCsv() {
    if (!q.data) return;
    downloadCsv(
      `recebimentos-${q.data.from}-${q.data.to}.csv`,
      ["Aluno", "Valor (R$)", "Pago em", "Forma"],
      q.data.paidInPeriod.map((r) => [
        r.studentName,
        formatMoneyCsv(r.amountCents),
        formatDateBr(r.paidAt),
        settlementLabel(r.settlementSource),
      ]),
    );
  }

  function exportOverdueCsv() {
    if (!q.data) return;
    downloadCsv(
      `inadimplencia-${q.data.to}.csv`,
      ["Aluno", "Valor (R$)", "Vencimento"],
      q.data.overdueOpen.map((r) => [
        r.studentName,
        formatMoneyCsv(r.amountCents),
        formatDateBr(r.dueAt),
      ]),
    );
  }

  return (
    <div className="space-y-8">
      <ReportsDateRange
        fromInput={fromInput}
        toInput={toInput}
        onFromChange={setFromInput}
        onToChange={setToInput}
        busy={q.isFetching}
        onApply={(from, to) => {
          setFromIso(from);
          setToIso(to);
        }}
      />

      {q.isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : q.isError ? (
        <p className="text-sm text-red-600">{(q.error as Error).message}</p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            Período: {formatIsoDateBr(q.data!.from)} a {formatIsoDateBr(q.data!.to)}
          </p>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-border p-4">
              <p className="text-sm text-muted-foreground">Recebido no período</p>
              <p className="text-xl font-semibold">{money(q.data!.summary.receivedCents)}</p>
              <p className="text-xs text-muted-foreground">
                {q.data!.summary.paidCount} pagamento(s)
              </p>
            </div>
            <div className="rounded-lg border border-border p-4">
              <p className="text-sm text-muted-foreground">Em aberto (hoje)</p>
              <p className="text-xl font-semibold">{money(q.data!.summary.openCents)}</p>
              <p className="text-xs text-muted-foreground">
                {q.data!.summary.openCount} fatura(s)
              </p>
            </div>
            <div className="rounded-lg border border-red-200 bg-red-50/50 p-4 dark:border-red-900 dark:bg-red-950/20">
              <p className="text-sm text-muted-foreground">Vencidas</p>
              <p className="text-xl font-semibold text-red-700 dark:text-red-400">
                {money(q.data!.summary.overdueCents)}
              </p>
              <p className="text-xs text-muted-foreground">
                {q.data!.summary.overdueCount} fatura(s)
              </p>
            </div>
            <div className="rounded-lg border border-border p-4">
              <p className="text-sm text-muted-foreground">Alunos</p>
              <p className="text-sm mt-1">
                <span className="font-medium">{q.data!.summary.studentsActive}</span> ativos ·{" "}
                <span className="font-medium text-red-600">
                  {q.data!.summary.studentsDelinquent}
                </span>{" "}
                inadimplentes · {q.data!.summary.studentsInactive} inativos
              </p>
            </div>
          </div>

          <section>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-medium">Pagamentos no período</h2>
              {q.data!.paidInPeriod.length > 0 ? (
                <Button type="button" size="sm" variant="outline" onClick={exportPaidCsv}>
                  Exportar CSV
                </Button>
              ) : null}
            </div>
            {q.data!.paidInPeriod.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                Nenhum pagamento registrado neste período.
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-border rounded-lg border border-border">
                {q.data!.paidInPeriod.map((r) => (
                  <li
                    key={r.invoiceId}
                    className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"
                  >
                    <Link
                      href={`/balcao/alunos/${r.studentId}`}
                      className="font-medium hover:underline"
                    >
                      {r.studentName}
                    </Link>
                    <span>
                      {money(r.amountCents)} · {formatDateBr(r.paidAt)} ·{" "}
                      {settlementLabel(r.settlementSource)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-medium">Faturas vencidas em aberto</h2>
              {q.data!.overdueOpen.length > 0 ? (
                <Button type="button" size="sm" variant="outline" onClick={exportOverdueCsv}>
                  Exportar CSV
                </Button>
              ) : null}
            </div>
            {q.data!.overdueOpen.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                Nenhuma fatura vencida em aberto.
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-border rounded-lg border border-border">
                {q.data!.overdueOpen.map((r) => (
                  <li
                    key={r.invoiceId}
                    className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"
                  >
                    <Link
                      href={`/balcao/alunos/${r.studentId}`}
                      className="font-medium hover:underline"
                    >
                      {r.studentName}
                    </Link>
                    <span className="text-red-600">
                      {money(r.amountCents)} · venceu {formatDateBr(r.dueAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
