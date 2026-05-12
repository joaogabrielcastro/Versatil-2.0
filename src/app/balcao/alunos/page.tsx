"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NewStudentForm } from "@/components/balcao/new-student-form";

type StudentRow = {
  id: string;
  fullName: string;
  cpf: string;
  email: string | null;
  status: string;
};

async function fetchStudents(q: string) {
  const params = new URLSearchParams({ limit: "50" });
  if (q.trim()) params.set("q", q.trim());
  const res = await fetch(`/api/students?${params.toString()}`, {
    credentials: "include",
  });
  if (!res.ok) {
    throw new Error("Falha ao carregar alunos.");
  }
  return (await res.json()) as { items: StudentRow[] };
}

export default function AlunosPage() {
  const [q, setQ] = useState("");
  const debounced = useDebouncedValue(q, 300);

  const query = useQuery({
    queryKey: ["students", debounced],
    queryFn: () => fetchStudents(debounced),
  });

  const items = query.data?.items ?? [];

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Alunos</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Busca por nome, CPF ou e-mail.
          </p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href="/balcao">Voltar ao painel</Link>
        </Button>
      </div>

      <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center">
        <Input
          placeholder="Buscar…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-md"
        />
      </div>

      <section className="mt-8 grid gap-8 lg:grid-cols-2">
        <div>
          <h2 className="text-sm font-medium text-muted-foreground">Resultados</h2>
          <div className="mt-2 overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead className="bg-muted/60">
                <tr>
                  <th className="px-3 py-2 font-medium">Nome</th>
                  <th className="px-3 py-2 font-medium">CPF</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {query.isLoading ? (
                  <tr>
                    <td colSpan={3} className="px-3 py-6 text-muted-foreground">
                      Carregando…
                    </td>
                  </tr>
                ) : query.isError ? (
                  <tr>
                    <td colSpan={3} className="px-3 py-6 text-red-600">
                      {(query.error as Error).message}
                    </td>
                  </tr>
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-3 py-6 text-muted-foreground">
                      Nenhum aluno encontrado.
                    </td>
                  </tr>
                ) : (
                  items.map((r) => (
                    <tr key={r.id} className="border-t border-border">
                      <td className="px-3 py-2">
                        <Link
                          className="font-medium underline-offset-4 hover:underline"
                          href={`/balcao/alunos/${r.id}`}
                        >
                          {r.fullName}
                        </Link>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">{r.cpf}</td>
                      <td className="px-3 py-2 capitalize">{r.status}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
        <div>
          <h2 className="text-sm font-medium text-muted-foreground">
            Novo aluno
          </h2>
          <div className="mt-2 rounded-lg border border-border p-4">
            <NewStudentForm
              onCreated={() => {
                void query.refetch();
              }}
            />
          </div>
        </div>
      </section>
    </main>
  );
}

function useDebouncedValue<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}
