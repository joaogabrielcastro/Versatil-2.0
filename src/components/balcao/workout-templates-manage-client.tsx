"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ExerciseEditor, exercisesForSave } from "@/components/balcao/exercise-editor";
import type { WorkoutExercise } from "@/lib/workouts/types";

type Template = {
  id: string;
  name: string;
  description: string | null;
  exercises: WorkoutExercise[];
  isPreset: boolean;
  active: boolean;
};

async function fetchTemplates() {
  const res = await fetch("/api/workout-templates", { credentials: "include" });
  if (!res.ok) throw new Error("Falha ao carregar modelos.");
  const j = (await res.json()) as { items: Template[] };
  return j.items;
}

export function WorkoutTemplatesManageClient({ isAdmin }: { isAdmin: boolean }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["workout-templates"], queryFn: fetchTemplates });
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [exercises, setExercises] = useState<WorkoutExercise[]>([
    { name: "", sets: "3", reps: "10–12", rest: "60s" },
  ]);
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editExercises, setEditExercises] = useState<WorkoutExercise[]>([]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!isAdmin) return;
    const list = exercisesForSave(exercises);
    if (!name.trim() || list.length === 0) return;
    setBusy(true);
    try {
      const res = await fetch("/api/workout-templates", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          exercises: list,
        }),
      });
      if (!res.ok) return;
      setName("");
      setDescription("");
      setExercises([{ name: "", sets: "3", reps: "10–12", rest: "60s" }]);
      await qc.invalidateQueries({ queryKey: ["workout-templates"] });
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit(t: Template) {
    if (!isAdmin || !editingId) return;
    const list = exercisesForSave(editExercises);
    if (list.length === 0) return;
    setBusy(true);
    try {
      await fetch(`/api/workout-templates/${t.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exercises: list }),
      });
      setEditingId(null);
      await qc.invalidateQueries({ queryKey: ["workout-templates"] });
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(t: Template) {
    if (!isAdmin) return;
    setBusy(true);
    try {
      await fetch(`/api/workout-templates/${t.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !t.active }),
      });
      await qc.invalidateQueries({ queryKey: ["workout-templates"] });
    } finally {
      setBusy(false);
    }
  }

  if (q.isLoading) {
    return <p className="text-sm text-muted-foreground">Carregando…</p>;
  }
  if (q.isError) {
    return <p className="text-sm text-red-600">{(q.error as Error).message}</p>;
  }

  const items = q.data ?? [];

  return (
    <div className="space-y-10">
      {isAdmin ? (
        <section>
          <h2 className="text-lg font-medium">Novo modelo</h2>
          <form onSubmit={(e) => void create(e)} className="mt-3 max-w-3xl space-y-3">
            <Input
              placeholder="Nome do treino"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Input
              placeholder="Descrição (opcional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <ExerciseEditor value={exercises} onChange={setExercises} disabled={busy} />
            <Button type="submit" disabled={busy}>
              Criar modelo
            </Button>
          </form>
        </section>
      ) : (
        <p className="text-sm text-muted-foreground">
          Apenas administradores podem criar ou editar modelos. Você pode atribuir modelos na ficha do aluno.
        </p>
      )}

      <section>
        <h2 className="text-lg font-medium">Modelos disponíveis</h2>
        <ul className="mt-4 space-y-4">
          {items.map((t) => (
            <li key={t.id} className="rounded-lg border border-border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium">
                    {t.name}
                    {t.isPreset ? (
                      <span className="ml-2 text-xs text-muted-foreground">(pré-fixado)</span>
                    ) : null}
                  </p>
                  {t.description ? (
                    <p className="mt-1 text-sm text-muted-foreground">{t.description}</p>
                  ) : null}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t.exercises.length} exercícios · {t.active ? "ativo" : "inativo"}
                  </p>
                </div>
                {isAdmin ? (
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() => {
                        if (editingId === t.id) {
                          setEditingId(null);
                        } else {
                          setEditingId(t.id);
                          setEditExercises(t.exercises);
                        }
                      }}
                    >
                      {editingId === t.id ? "Cancelar" : "Editar exercícios"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() => void toggleActive(t)}
                    >
                      {t.active ? "Desativar" : "Ativar"}
                    </Button>
                  </div>
                ) : null}
              </div>
              {editingId === t.id ? (
                <div className="mt-4 space-y-3">
                  <ExerciseEditor
                    value={editExercises}
                    onChange={setEditExercises}
                    disabled={busy}
                  />
                  <Button type="button" size="sm" disabled={busy} onClick={() => void saveEdit(t)}>
                    Salvar exercícios
                  </Button>
                </div>
              ) : (
                <ol className="mt-3 list-decimal pl-5 text-sm">
                  {t.exercises.map((ex, i) => (
                    <li key={i} className="mt-1">
                      <span className="font-medium">{ex.name}</span>
                      {[ex.sets, ex.reps, ex.load, ex.rest]
                        .filter(Boolean)
                        .length > 0 && (
                        <span className="text-muted-foreground">
                          {" "}
                          — {[ex.sets && `séries ${ex.sets}`, ex.reps && `reps ${ex.reps}`, ex.load && `carga ${ex.load}`, ex.rest && `descanso ${ex.rest}`]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
