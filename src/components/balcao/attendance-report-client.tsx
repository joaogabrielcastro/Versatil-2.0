"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { ReportsDateRange } from "@/components/balcao/reports-date-range";
import { Button } from "@/components/ui/button";
import { downloadCsv } from "@/lib/reports/csv";
import { formatDateBr, formatDateTimeBr, formatIsoDateBr, toIsoDateInTz } from "@/lib/dates/br";

type AttendanceReport = {
  from: string;
  to: string;
  summary: {
    totalVisits: number;
    uniqueStudents: number;
    daysWithVisits: number;
    avgVisitsPerDay: number;
  };
  daily: { date: string; uniqueStudents: number; visits: number }[];
  topStudents: { studentId: string; fullName: string; visits: number }[];
  absentActive: {
    studentId: string;
    fullName: string;
    lastVisitAt: string | null;
  }[];
};

async function fetchAttendance(from: string, to: string) {
  const res = await fetch(
    `/api/reports/attendance?from=${from}&to=${to}`,
    { credentials: "include" },
  );
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(j.error ?? "Falha ao carregar relatório de presença.");
  }
  return res.json() as Promise<AttendanceReport>;
}

function defaultRange() {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 30);
  const fromIso = toIsoDateInTz(from);
  const toIso = toIsoDateInTz(to);
  return { fromIso, toIso };
}

export function AttendanceReportClient() {
  const init = (() => {
    const { fromIso, toIso } = defaultRange();
    return {
      fromIso,
      toIso,
      fromInput: formatIsoDateBr(fromIso),
      toInput: formatIsoDateBr(toIso),
    };
  })();

  const [fromIso, setFromIso] = useState(init.fromIso);
  const [toIso, setToIso] = useState(init.toIso);
  const [fromInput, setFromInput] = useState(init.fromInput);
  const [toInput, setToInput] = useState(init.toInput);

  const q = useQuery({
    queryKey: ["report-attendance", fromIso, toIso],
    queryFn: () => fetchAttendance(fromIso, toIso),
  });

  const maxVisits =
    q.data?.daily.reduce((m, d) => Math.max(m, d.visits), 0) ?? 0;

  function exportDailyCsv() {
    if (!q.data) return;
    downloadCsv(
      `presenca-diaria-${q.data.from}-${q.data.to}.csv`,
      ["Data", "Alunos únicos", "Entradas"],
      q.data.daily.map((d) => [
        formatIsoDateBr(d.date),
        String(d.uniqueStudents),
        String(d.visits),
      ]),
    );
  }

  function exportAbsentCsv() {
    if (!q.data) return;
    downloadCsv(
      `ativos-sem-presenca-${q.data.from}-${q.data.to}.csv`,
      ["Aluno", "Última visita"],
      q.data.absentActive.map((r) => [
        r.fullName,
        r.lastVisitAt ? formatDateTimeBr(r.lastVisitAt) : "Nunca",
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
            Período: {formatIsoDateBr(q.data!.from)} a {formatIsoDateBr(q.data!.to)} ·
            fonte: catraca / facial
          </p>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-border p-4">
              <p className="text-sm text-muted-foreground">Total de entradas</p>
              <p className="text-xl font-semibold">{q.data!.summary.totalVisits}</p>
            </div>
            <div className="rounded-lg border border-border p-4">
              <p className="text-sm text-muted-foreground">Alunos distintos</p>
              <p className="text-xl font-semibold">{q.data!.summary.uniqueStudents}</p>
            </div>
            <div className="rounded-lg border border-border p-4">
              <p className="text-sm text-muted-foreground">Dias com movimento</p>
              <p className="text-xl font-semibold">{q.data!.summary.daysWithVisits}</p>
            </div>
            <div className="rounded-lg border border-border p-4">
              <p className="text-sm text-muted-foreground">Média entradas/dia</p>
              <p className="text-xl font-semibold">{q.data!.summary.avgVisitsPerDay}</p>
            </div>
          </div>

          <section>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-medium">Entradas por dia</h2>
              <Button type="button" size="sm" variant="outline" onClick={exportDailyCsv}>
                Exportar CSV
              </Button>
            </div>
            <ul className="mt-3 space-y-2">
              {q.data!.daily.map((d) => (
                <li key={d.date} className="flex items-center gap-3 text-sm">
                  <span className="w-24 shrink-0 text-muted-foreground">
                    {formatIsoDateBr(d.date)}
                  </span>
                  <div className="h-2 flex-1 max-w-md overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{
                        width:
                          maxVisits > 0
                            ? `${Math.round((d.visits / maxVisits) * 100)}%`
                            : "0%",
                      }}
                    />
                  </div>
                  <span className="w-32 shrink-0 text-right text-muted-foreground">
                    {d.visits} entrada(s) · {d.uniqueStudents} aluno(s)
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-medium">Mais frequentes no período</h2>
            {q.data!.topStudents.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">Sem registros.</p>
            ) : (
              <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm">
                {q.data!.topStudents.map((s) => (
                  <li key={s.studentId}>
                    <Link
                      href={`/balcao/alunos/${s.studentId}`}
                      className="font-medium hover:underline"
                    >
                      {s.fullName}
                    </Link>
                    <span className="text-muted-foreground"> — {s.visits} entrada(s)</span>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-lg font-medium">Ativos sem presença no período</h2>
                <p className="text-sm text-muted-foreground">
                  Alunos com status ativo que não passaram na catraca entre as datas
                  selecionadas.
                </p>
              </div>
              {q.data!.absentActive.length > 0 ? (
                <Button type="button" size="sm" variant="outline" onClick={exportAbsentCsv}>
                  Exportar CSV
                </Button>
              ) : null}
            </div>
            {q.data!.absentActive.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                Todos os alunos ativos tiveram pelo menos uma entrada no período.
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-border rounded-lg border border-border">
                {q.data!.absentActive.map((r) => (
                  <li
                    key={r.studentId}
                    className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"
                  >
                    <Link
                      href={`/balcao/alunos/${r.studentId}`}
                      className="font-medium hover:underline"
                    >
                      {r.fullName}
                    </Link>
                    <span className="text-muted-foreground">
                      Última visita:{" "}
                      {r.lastVisitAt ? formatDateBr(r.lastVisitAt) : "nunca registrada"}
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
