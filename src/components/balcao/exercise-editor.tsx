"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { WorkoutExercise } from "@/lib/workouts/types";

const emptyRow = (): WorkoutExercise => ({ name: "", sets: "", reps: "", load: "", rest: "" });

export function ExerciseEditor({
  value,
  onChange,
  disabled,
}: {
  value: WorkoutExercise[];
  onChange: (v: WorkoutExercise[]) => void;
  disabled?: boolean;
}) {
  const rows = value.length > 0 ? value : [emptyRow()];

  function updateRow(i: number, patch: Partial<WorkoutExercise>) {
    const next = [...rows];
    next[i] = { ...next[i], ...patch };
    onChange(next);
  }

  function addRow() {
    onChange([...rows, emptyRow()]);
  }

  function removeRow(i: number) {
    if (rows.length <= 1) {
      onChange([emptyRow()]);
      return;
    }
    onChange(rows.filter((_, idx) => idx !== i));
  }

  return (
    <div className="space-y-3">
      {rows.map((row, i) => (
        <div
          key={i}
          className="grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-6"
        >
          <Input
            className="sm:col-span-2"
            placeholder="Exercício"
            value={row.name}
            disabled={disabled}
            onChange={(e) => updateRow(i, { name: e.target.value })}
          />
          <Input
            placeholder="Séries"
            value={row.sets ?? ""}
            disabled={disabled}
            onChange={(e) => updateRow(i, { sets: e.target.value })}
          />
          <Input
            placeholder="Reps"
            value={row.reps ?? ""}
            disabled={disabled}
            onChange={(e) => updateRow(i, { reps: e.target.value })}
          />
          <Input
            placeholder="Carga"
            value={row.load ?? ""}
            disabled={disabled}
            onChange={(e) => updateRow(i, { load: e.target.value })}
          />
          <div className="flex gap-2 sm:col-span-2">
            <Input
              placeholder="Descanso"
              value={row.rest ?? ""}
              disabled={disabled}
              onChange={(e) => updateRow(i, { rest: e.target.value })}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled}
              onClick={() => removeRow(i)}
            >
              −
            </Button>
          </div>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={addRow}>
        + Exercício
      </Button>
    </div>
  );
}

export function exercisesForSave(rows: WorkoutExercise[]): WorkoutExercise[] {
  return rows
    .map((r) => ({
      name: r.name.trim(),
      sets: r.sets?.trim() || undefined,
      reps: r.reps?.trim() || undefined,
      load: r.load?.trim() || undefined,
      rest: r.rest?.trim() || undefined,
      notes: r.notes?.trim() || undefined,
    }))
    .filter((r) => r.name.length > 0);
}
