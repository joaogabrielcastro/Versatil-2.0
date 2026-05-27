"use client";

import { useQuery } from "@tanstack/react-query";
import { formatIsoDateBr, formatTimeBr } from "@/lib/dates/br";

type AttendanceDay = {
  date: string;
  visits: number;
  sources: string[];
  lastAt: string;
};

function sourceLabel(s: string) {
  if (s === "catraca") return "Catraca / facial";
  return s;
}

async function fetchAttendance(studentId: string) {
  const res = await fetch(`/api/students/${studentId}/attendance?limit=120`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error("Falha ao carregar presença.");
  return res.json() as Promise<{
    days: AttendanceDay[];
    today: string;
  }>;
}

export function StudentAttendancePanel({ studentId }: { studentId: string }) {
  const q = useQuery({
    queryKey: ["student-attendance", studentId],
    queryFn: () => fetchAttendance(studentId),
  });

  if (q.isLoading) {
    return <p className="text-sm text-muted-foreground">Carregando presença…</p>;
  }
  if (q.isError) {
    return <p className="text-sm text-red-600">{(q.error as Error).message}</p>;
  }

  const days = q.data?.days ?? [];
  const today = q.data?.today ?? "";
  const cameToday = days.some((d) => d.date === today);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {cameToday ? (
          <span className="text-green-700 dark:text-green-400">
            Entrada registrada hoje ({formatIsoDateBr(today)}) — catraca / facial.
          </span>
        ) : (
          <span>Hoje ({formatIsoDateBr(today)}) ainda sem entrada na catraca.</span>
        )}
      </p>
      <p className="text-xs text-muted-foreground">
        A presença é registrada automaticamente quando o aluno passa na catraca com
        acesso liberado.
      </p>

      {days.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum dia de presença registrado.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-muted/40">
              <tr>
                <th className="px-3 py-2 font-medium">Dia</th>
                <th className="px-3 py-2 font-medium">Entradas</th>
                <th className="px-3 py-2 font-medium">Origem</th>
                <th className="px-3 py-2 font-medium">Último horário</th>
              </tr>
            </thead>
            <tbody>
              {days.map((d) => (
                <tr key={d.date} className="border-b border-border last:border-0">
                  <td className="px-3 py-2">{formatIsoDateBr(d.date)}</td>
                  <td className="px-3 py-2">{d.visits}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {d.sources.map(sourceLabel).join(", ")}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {formatTimeBr(d.lastAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
