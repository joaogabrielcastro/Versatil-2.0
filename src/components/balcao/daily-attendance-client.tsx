"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { BrDateInput } from "@/components/ui/br-date-input";
import {
  formatIsoDateBr,
  formatTimeBr,
  parseDateBr,
  toIsoDateInTz,
} from "@/lib/dates/br";

type Attendee = {
  studentId: string;
  fullName: string;
  visits: number;
  lastAt: string;
};

async function fetchDaily(date: string) {
  const res = await fetch(`/api/attendance/daily?date=${date}`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error("Falha ao carregar presença do dia.");
  return res.json() as Promise<{
    date: string;
    totalStudents: number;
    totalVisits: number;
    attendees: Attendee[];
  }>;
}

export function DailyAttendanceClient() {
  const todayIso = toIsoDateInTz();
  const [dateInput, setDateInput] = useState(formatIsoDateBr(todayIso));
  const [queryDate, setQueryDate] = useState(todayIso);

  const q = useQuery({
    queryKey: ["attendance-daily", queryDate],
    queryFn: () => fetchDaily(queryDate),
  });

  function applyDate() {
    const parsed = parseDateBr(dateInput);
    if (!parsed) return;
    const iso = toIsoDateInTz(parsed);
    setQueryDate(iso);
    setDateInput(formatIsoDateBr(iso));
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Data (dd/mm/aaaa)
          <BrDateInput value={dateInput} onChange={setDateInput} />
        </label>
        <Button type="button" variant="outline" onClick={applyDate}>
          Buscar
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            const iso = toIsoDateInTz();
            setQueryDate(iso);
            setDateInput(formatIsoDateBr(iso));
          }}
        >
          Hoje
        </Button>
      </div>

      {q.isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : q.isError ? (
        <p className="text-sm text-red-600">{(q.error as Error).message}</p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {formatIsoDateBr(q.data!.date)} — {q.data!.totalStudents} aluno(s) ·{" "}
            {q.data!.totalVisits} entrada(s) (catraca / facial).
          </p>
          {q.data!.attendees.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Ninguém registrou presença neste dia.
            </p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {q.data!.attendees.map((a) => (
                <li
                  key={a.studentId}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"
                >
                  <Link
                    href={`/balcao/alunos/${a.studentId}`}
                    className="font-medium hover:underline"
                  >
                    {a.fullName}
                  </Link>
                  <span className="text-muted-foreground">
                    {a.visits} entrada(s) · última {formatTimeBr(a.lastAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
