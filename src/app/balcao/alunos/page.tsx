"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Search, UserPlus, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { NewStudentForm } from "@/components/balcao/new-student-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { TableSkeleton } from "@/components/ui/skeleton";
import { StudentStatusBadge } from "@/components/ui/status-badge";
import { formatCpf } from "@/lib/labels";

const PAGE_SIZE = 25;

type StudentRow = {
  id: string;
  fullName: string;
  cpf: string;
  email: string | null;
  status: string;
};

async function fetchStudents(q: string, offset: number) {
  const params = new URLSearchParams({
    limit: String(PAGE_SIZE),
    offset: String(offset),
  });
  if (q.trim()) params.set("q", q.trim());
  const res = await fetch(`/api/students?${params.toString()}`, {
    credentials: "include",
  });
  if (!res.ok) {
    throw new Error("Falha ao carregar alunos.");
  }
  return (await res.json()) as {
    items: StudentRow[];
    total: number;
    limit: number;
    offset: number;
  };
}

export default function AlunosPage() {
  const [q, setQ] = useState("");
  const [offset, setOffset] = useState(0);
  const debounced = useDebouncedValue(q, 300);

  useEffect(() => {
    setOffset(0);
  }, [debounced]);

  const query = useQuery({
    queryKey: ["students", debounced, offset],
    queryFn: () => fetchStudents(debounced, offset),
  });

  const items = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + PAGE_SIZE, total);

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <PageHeader
        title="Alunos"
        description="Busca por nome, CPF ou e-mail."
        backHref="/balcao"
        backLabel="Painel"
      />

      <div className="mt-6 relative max-w-md">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          placeholder="Buscar aluno…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="pl-9"
          aria-label="Buscar aluno"
        />
      </div>

      <section className="mt-8 grid gap-8 lg:grid-cols-2">
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-medium text-muted-foreground">Resultados</h2>
            {total > 0 ? (
              <p className="text-xs text-muted-foreground">
                {from}–{to} de {total}
              </p>
            ) : null}
          </div>
          <div className="mt-2 overflow-x-auto rounded-lg border border-border bg-card shadow-sm">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead className="bg-muted/60">
                <tr>
                  <th className="px-3 py-2.5 font-medium">Nome</th>
                  <th className="px-3 py-2.5 font-medium">CPF</th>
                  <th className="px-3 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {query.isLoading ? (
                  <TableSkeleton rows={6} cols={3} />
                ) : query.isError ? (
                  <tr>
                    <td colSpan={3} className="px-3 py-6 text-red-600">
                      {(query.error as Error).message}
                    </td>
                  </tr>
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="p-0">
                      <EmptyState
                        icon={Users}
                        title="Nenhum aluno encontrado"
                        description={
                          debounced
                            ? "Tente outro termo de busca."
                            : "Cadastre o primeiro aluno ao lado."
                        }
                        className="border-0 bg-transparent"
                      />
                    </td>
                  </tr>
                ) : (
                  items.map((r) => (
                    <tr
                      key={r.id}
                      className="border-t border-border transition-colors hover:bg-muted/30"
                    >
                      <td className="px-3 py-2.5">
                        <Link
                          className="font-medium text-primary underline-offset-4 hover:underline"
                          href={`/balcao/alunos/${r.id}`}
                        >
                          {r.fullName}
                        </Link>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">
                        {formatCpf(r.cpf)}
                      </td>
                      <td className="px-3 py-2.5">
                        <StudentStatusBadge status={r.status} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {totalPages > 1 ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={offset === 0 || query.isFetching}
                onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
              >
                Anterior
              </Button>
              <span className="text-sm text-muted-foreground">
                Página {page} de {totalPages}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={offset + PAGE_SIZE >= total || query.isFetching}
                onClick={() => setOffset((o) => o + PAGE_SIZE)}
              >
                Próxima
              </Button>
            </div>
          ) : null}
        </div>

        <div>
          <h2 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <UserPlus className="size-4" aria-hidden />
            Novo aluno
          </h2>
          <Card className="mt-2">
            <CardContent className="pt-5">
              <NewStudentForm
                onCreated={() => {
                  void query.refetch().catch(() => {});
                }}
              />
            </CardContent>
          </Card>
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
