"use client";

import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ExerciseEditor, exercisesForSave } from "@/components/balcao/exercise-editor";
import type { WorkoutExercise } from "@/lib/workouts/types";

type Workout = {
  id: string;
  name: string;
  exercises: WorkoutExercise[];
  notes: string | null;
  updatedAt: string;
};

type Template = { id: string; name: string; active: boolean };

async function fetchWorkouts(studentId: string) {
  const res = await fetch(`/api/students/${studentId}/workouts`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error("Falha ao carregar treinos.");
  const j = (await res.json()) as { items: Workout[] };
  return j.items;
}

async function fetchTemplates() {
  const res = await fetch("/api/workout-templates", { credentials: "include" });
  if (!res.ok) throw new Error("Falha ao carregar modelos.");
  const j = (await res.json()) as { items: Template[] };
  return j.items.filter((t) => t.active);
}

export function StudentWorkoutsPanel({ studentId }: { studentId: string }) {
  const qc = useQueryClient();
  const wq = useQuery({
    queryKey: ["student-workouts", studentId],
    queryFn: () => fetchWorkouts(studentId),
  });
  const tq = useQuery({ queryKey: ["workout-templates"], queryFn: fetchTemplates });

  const [templateId, setTemplateId] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editExercises, setEditExercises] = useState<WorkoutExercise[]>([]);
  const [editNotes, setEditNotes] = useState("");

  async function assignFromTemplate() {
    if (!templateId) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/students/${studentId}/workouts`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId }),
      });
      if (!res.ok) return;
      setTemplateId("");
      await qc.invalidateQueries({ queryKey: ["student-workouts", studentId] });
    } finally {
      setBusy(false);
    }
  }

  async function saveWorkout(workoutId: string) {
    const list = exercisesForSave(editExercises);
    if (!editName.trim() || list.length === 0) return;
    setBusy(true);
    try {
      await fetch(`/api/students/${studentId}/workouts/${workoutId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName.trim(),
          exercises: list,
          notes: editNotes.trim() || null,
        }),
      });
      setEditingId(null);
      await qc.invalidateQueries({ queryKey: ["student-workouts", studentId] });
    } finally {
      setBusy(false);
    }
  }

  async function removeWorkout(workoutId: string) {
    if (!confirm("Remover este treino do aluno?")) return;
    setBusy(true);
    try {
      await fetch(`/api/students/${studentId}/workouts/${workoutId}`, {
        method: "DELETE",
        credentials: "include",
      });
      await qc.invalidateQueries({ queryKey: ["student-workouts", studentId] });
    } finally {
      setBusy(false);
    }
  }

  if (wq.isLoading) {
    return <p className="text-sm text-muted-foreground">Carregando treinos…</p>;
  }

  const workouts = wq.data ?? [];
  const templates = tq.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-border bg-muted/30 p-4">
        <label className="flex flex-col gap-1 text-sm">
          Atribuir modelo pré-fixado
          <select
            className="min-w-[220px] rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
          >
            <option value="">Selecione…</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <Button
          type="button"
          disabled={busy || !templateId}
          onClick={() => void assignFromTemplate()}
        >
          Atribuir ao aluno
        </Button>
        <p className="w-full text-xs text-muted-foreground">
          O treino pode ser editado depois. Use Imprimir para entregar na recepção.
        </p>
      </div>

      {workouts.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum treino atribuído ainda.</p>
      ) : (
        <ul className="space-y-4">
          {workouts.map((w) => (
            <li key={w.id} className="rounded-lg border border-border p-4">
              {editingId === w.id ? (
                <div className="space-y-3">
                  <input
                    className="w-full rounded-md border border-input px-3 py-2 text-sm"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                  />
                  <textarea
                    className="w-full rounded-md border border-input px-3 py-2 text-sm"
                    placeholder="Observações para o aluno"
                    rows={2}
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                  />
                  <ExerciseEditor
                    value={editExercises}
                    onChange={setEditExercises}
                    disabled={busy}
                  />
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      disabled={busy}
                      onClick={() => void saveWorkout(w.id)}
                    >
                      Salvar
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setEditingId(null)}
                    >
                      Cancelar
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium">{w.name}</p>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" asChild>
                        <Link
                          href={`/balcao/alunos/${studentId}/treino/${w.id}/imprimir`}
                          target="_blank"
                        >
                          Imprimir
                        </Link>
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        onClick={() => {
                          setEditingId(w.id);
                          setEditName(w.name);
                          setEditExercises(w.exercises);
                          setEditNotes(w.notes ?? "");
                        }}
                      >
                        Editar
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        onClick={() => void removeWorkout(w.id)}
                      >
                        Remover
                      </Button>
                    </div>
                  </div>
                  <ol className="mt-3 list-decimal pl-5 text-sm">
                    {w.exercises.map((ex, i) => (
                      <li key={i} className="mt-1">
                        {ex.name}
                        {ex.sets || ex.reps ? (
                          <span className="text-muted-foreground">
                            {" "}
                            ({[ex.sets, ex.reps, ex.load].filter(Boolean).join(" · ")})
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ol>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
