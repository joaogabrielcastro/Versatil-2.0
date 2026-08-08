"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrintWorkoutSheet } from "@/components/balcao/print-workout-sheet";
import { AppShellHeader } from "@/components/brand/app-shell-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { WorkoutExercise } from "@/lib/workouts/types";

type StudentOption = { id: string; fullName: string };

type WorkoutToday = {
  id: string;
  name: string;
  notes: string | null;
  exercises: WorkoutExercise[];
};

function kioskQuery(slug: string, token: string, extra: Record<string, string>) {
  const params = new URLSearchParams({
    tenantSlug: slug.trim(),
    ...extra,
  });
  if (token.trim()) params.set("token", token.trim());
  return params.toString();
}

export function WorkoutPrintKiosk({
  initialSlug,
  slugFromSubdomain,
  initialToken,
}: {
  initialSlug: string;
  slugFromSubdomain: boolean;
  initialToken: string;
}) {
  const [tenantSlug, setTenantSlug] = useState(initialSlug);
  const [kioskToken, setKioskToken] = useState(initialToken);
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [nameFilter, setNameFilter] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [workout, setWorkout] = useState<WorkoutToday | null>(null);
  const [studentName, setStudentName] = useState("");
  const [studentCpf, setStudentCpf] = useState("");
  const [dayLabel, setDayLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingWorkout, setLoadingWorkout] = useState(false);
  const [showPrint, setShowPrint] = useState(false);
  const searchSeq = useRef(0);

  const slugReady = tenantSlug.trim().length >= 2;

  const searchStudents = useCallback(
    async (q: string) => {
      if (!slugReady) return;
      const trimmed = q.trim();
      if (trimmed.length < 2) {
        setStudents([]);
        return;
      }

      const seq = ++searchSeq.current;
      setLoadingList(true);
      setError(null);
      try {
        const qs = kioskQuery(tenantSlug, kioskToken, { q: trimmed });
        const res = await fetch(`/api/kiosk/students?${qs}`, {
          headers: kioskToken.trim()
            ? { "x-kiosk-token": kioskToken.trim() }
            : undefined,
        });
        const j = (await res.json()) as {
          error?: string;
          items?: StudentOption[];
        };
        if (seq !== searchSeq.current) return;
        if (!res.ok) {
          setError(j.error ?? "Não foi possível buscar nomes.");
          setStudents([]);
          return;
        }
        setStudents(j.items ?? []);
      } catch {
        if (seq !== searchSeq.current) return;
        setError("Erro de rede. Tente de novo.");
        setStudents([]);
      } finally {
        if (seq === searchSeq.current) setLoadingList(false);
      }
    },
    [tenantSlug, kioskToken, slugReady],
  );

  useEffect(() => {
    const t = window.setTimeout(() => {
      void searchStudents(nameFilter);
    }, 280);
    return () => window.clearTimeout(t);
  }, [nameFilter, searchStudents]);

  async function loadWorkoutForStudent(studentId: string) {
    if (!slugReady || !studentId) return;
    setLoadingWorkout(true);
    setError(null);
    setWorkout(null);
    setShowPrint(false);
    try {
      const qs = kioskQuery(tenantSlug, kioskToken, {});
      const res = await fetch(
        `/api/kiosk/students/${studentId}/workout-today?${qs}`,
        {
          headers: kioskToken.trim()
            ? { "x-kiosk-token": kioskToken.trim() }
            : undefined,
        },
      );
      const j = (await res.json()) as {
        error?: string;
        student?: { fullName: string; cpf: string };
        workout?: WorkoutToday;
        dayLabel?: string;
      };
      if (!res.ok) {
        setError(j.error ?? "Treino não encontrado.");
        return;
      }
      setStudentName(j.student!.fullName);
      setStudentCpf(j.student!.cpf);
      setWorkout(j.workout!);
      setDayLabel(j.dayLabel ?? "");
    } catch {
      setError("Erro de rede. Tente de novo.");
    } finally {
      setLoadingWorkout(false);
    }
  }

  function onSelectStudent(id: string) {
    setSelectedId(id);
    const s = students.find((x) => x.id === id);
    if (s) setNameFilter(s.fullName);
    void loadWorkoutForStudent(id);
  }

  function onConfirmName() {
    const exact = students.find(
      (s) => s.fullName.toLowerCase() === nameFilter.trim().toLowerCase(),
    );
    if (exact) {
      onSelectStudent(exact.id);
      return;
    }
    if (students.length === 1) {
      onSelectStudent(students[0]!.id);
      return;
    }
    setError(
      "Digite mais letras do nome e toque no nome correto na lista.",
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <AppShellHeader
        title="Treino do dia"
        subtitle={
          dayLabel
            ? `Digite seu nome e imprima o cupom · ${dayLabel}`
            : "Digite seu nome e imprima o treino de hoje"
        }
      />

      {!slugFromSubdomain ? (
        <div className="mt-8 flex flex-wrap items-end gap-2">
          <label className="flex flex-1 flex-col gap-1 text-sm">
            Academia (slug)
            <Input
              value={tenantSlug}
              onChange={(e) => setTenantSlug(e.target.value)}
              placeholder="demo"
            />
          </label>
        </div>
      ) : null}

      {!initialToken ? (
        <div className="mt-4 flex flex-wrap items-end gap-2">
          <label className="flex flex-1 flex-col gap-1 text-sm">
            Token do terminal
            <Input
              type="password"
              value={kioskToken}
              onChange={(e) => setKioskToken(e.target.value)}
              placeholder="Definido em KIOSK_ACCESS_SECRET"
              autoComplete="off"
            />
          </label>
        </div>
      ) : null}

      <section className="mt-8 space-y-4">
        <label className="flex flex-col gap-2 text-sm">
          <span className="font-medium text-lg">Seu nome</span>
          <Input
            className="h-12 text-lg"
            placeholder="Digite ao menos 2 letras…"
            value={nameFilter}
            onChange={(e) => {
              setNameFilter(e.target.value);
              setSelectedId("");
              setWorkout(null);
              setShowPrint(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onConfirmName();
              }
            }}
            autoComplete="off"
          />
        </label>

        {loadingList ? (
          <p className="text-sm text-muted-foreground">Buscando…</p>
        ) : nameFilter.trim().length >= 2 && students.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum nome correspondente.</p>
        ) : students.length > 0 ? (
          <p className="text-xs text-muted-foreground">
            {students.length} correspondente(s) — toque no seu nome
          </p>
        ) : null}

        {students.length > 0 ? (
          <ul className="grid gap-2 sm:grid-cols-2">
            {students.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  className={`w-full rounded-lg border px-4 py-3 text-left text-sm transition-colors hover:bg-muted/60 ${
                    selectedId === s.id
                      ? "border-primary bg-primary/5 font-medium"
                      : "border-border"
                  }`}
                  onClick={() => onSelectStudent(s.id)}
                >
                  {s.fullName}
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        <Button
          type="button"
          className="h-12 w-full text-base"
          disabled={loadingWorkout || nameFilter.trim().length < 2}
          onClick={() => onConfirmName()}
        >
          {loadingWorkout ? "Buscando treino…" : "Ver treino do dia"}
        </Button>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}
      </section>

      {workout ? (
        <section className="mt-10 space-y-4">
          <div className="rounded-lg border border-border bg-card/50 p-4 text-center">
            <p className="text-lg font-medium">{studentName}</p>
            <p className="text-sm text-muted-foreground">{workout.name}</p>
          </div>

          {!showPrint ? (
            <Button
              type="button"
              className="h-12 w-full text-base"
              onClick={() => setShowPrint(true)}
            >
              Preparar impressão
            </Button>
          ) : (
            <>
              <p className="no-print text-center text-xs text-muted-foreground">
                Formato cupom 80mm — selecione a impressora térmica no diálogo.
              </p>
              <div className="no-print flex gap-2">
                <Button type="button" className="flex-1" onClick={() => window.print()}>
                  Imprimir cupom
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowPrint(false);
                    setNameFilter("");
                    setSelectedId("");
                    setWorkout(null);
                    setStudents([]);
                    setError(null);
                  }}
                >
                  Outro aluno
                </Button>
              </div>
              <div className="mx-auto rounded-lg border border-dashed border-border bg-white shadow-sm">
                <PrintWorkoutSheet
                  studentName={studentName}
                  studentCpf={studentCpf}
                  workoutName={workout.name}
                  notes={workout.notes}
                  exercises={workout.exercises}
                  printedAt={new Date()}
                />
              </div>
            </>
          )}
        </section>
      ) : null}
    </div>
  );
}
