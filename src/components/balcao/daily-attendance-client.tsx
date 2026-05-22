"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Attendee = {
  studentId: string;
  fullName: string;
  visits: number;
  lastAt: string;
};

function todayIso() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

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
  const [date, setDate] = useState(todayIso());
  const q = useQuery({
    queryKey: ["attendance-daily", date],
    queryFn: () => fetchDaily(date),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Data
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-auto"
          />
        </label>
        <Button type="button" variant="outline" onClick={() => setDate(todayIso())}>
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
            {q.data!.totalStudents} aluno(s) · {q.data!.totalVisits} entrada(s) — registro
            automático pela catraca / reconhecimento facial.
          </p>
          {q.data!.attendees.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ninguém registrou presença neste dia.</p>
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
                    {a.visits} entrada(s) · última{" "}
                    {new Date(a.lastAt).toLocaleTimeString("pt-BR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
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
