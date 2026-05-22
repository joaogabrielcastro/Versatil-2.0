"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PrintWorkoutSheet } from "@/components/balcao/print-workout-sheet";
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

export function WorkoutPrintKiosk({
  initialSlug,
  slugFromSubdomain,
}: {
  initialSlug: string;
  slugFromSubdomain: boolean;
}) {
  const [tenantSlug, setTenantSlug] = useState(initialSlug);
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

  const slugReady = tenantSlug.trim().length >= 2;

  const loadStudents = useCallback(async () => {
    if (!slugReady) return;
    setLoadingList(true);
    setError(null);
    setStudents([]);
    setSelectedId("");
    setWorkout(null);
    setShowPrint(false);
    try {
      const res = await fetch(
        `/api/kiosk/students?tenantSlug=${encodeURIComponent(tenantSlug.trim())}`,
      );
      const j = (await res.json()) as {
        error?: string;
        items?: StudentOption[];
      };
      if (!res.ok) {
        setError(j.error ?? "Não foi possível carregar os nomes.");
        return;
      }
      setStudents(j.items ?? []);
    } catch {
      setError("Erro de rede. Tente de novo.");
    } finally {
      setLoadingList(false);
    }
  }, [tenantSlug, slugReady]);

  useEffect(() => {
    if (slugReady) void loadStudents();
  }, [slugReady, loadStudents]);

  const filtered = useMemo(() => {
    const q = nameFilter.trim().toLowerCase();
    if (!q) return students;
    return students.filter((s) => s.fullName.toLowerCase().includes(q));
  }, [students, nameFilter]);

  async function loadWorkoutForStudent(studentId: string) {
    if (!slugReady || !studentId) return;
    setLoadingWorkout(true);
    setError(null);
    setWorkout(null);
    setShowPrint(false);
    try {
      const res = await fetch(
        `/api/kiosk/students/${studentId}/workout-today?tenantSlug=${encodeURIComponent(tenantSlug.trim())}`,
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
    if (filtered.length === 1) {
      onSelectStudent(filtered[0]!.id);
      return;
    }
    setError("Selecione seu nome na lista ou toque no nome correto abaixo.");
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <header className="text-center">
        <h1 className="text-3xl font-semibold tracking-tight">Treino do dia</h1>
        <p className="mt-2 text-muted-foreground">
          Escolha seu nome e imprima o treino de hoje
          {dayLabel ? ` (${dayLabel})` : ""}
        </p>
      </header>

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
          <Button type="button" variant="outline" onClick={() => void loadStudents()}>
            Carregar nomes
          </Button>
        </div>
      ) : null}

      <section className="mt-8 space-y-4">
        <label className="flex flex-col gap-2 text-sm">
          <span className="font-medium text-lg">Seu nome</span>
          <Input
            className="h-12 text-lg"
            placeholder="Digite ou escolha na lista…"
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
            list="kiosk-student-names"
            autoComplete="off"
          />
          <datalist id="kiosk-student-names">
            {students.map((s) => (
              <option key={s.id} value={s.fullName} />
            ))}
          </datalist>
        </label>

        {loadingList ? (
          <p className="text-sm text-muted-foreground">Carregando nomes…</p>
        ) : students.length > 0 ? (
          <p className="text-xs text-muted-foreground">
            {students.length} aluno(s) cadastrado(s)
          </p>
        ) : slugReady ? (
          <p className="text-sm text-muted-foreground">Nenhum aluno encontrado.</p>
        ) : null}

        {nameFilter.trim() && filtered.length > 0 && filtered.length <= 12 ? (
          <ul className="grid gap-2 sm:grid-cols-2">
            {filtered.map((s) => (
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
          disabled={loadingWorkout || !nameFilter.trim()}
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
