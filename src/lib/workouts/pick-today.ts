/** Treino atribuído ao aluno (ordenação estável por nome). */
export type WorkoutPickItem = {
  id: string;
  name: string;
  exercises: unknown;
  notes: string | null;
  updatedAt: Date | string;
};

/**
 * Escolhe o treino do dia entre os treinos do aluno.
 * Com vários treinos, rotação por dia da semana (seg=0 … dom=6).
 */
export function pickWorkoutForToday<T extends WorkoutPickItem>(
  workouts: T[],
): T | null {
  if (workouts.length === 0) return null;
  if (workouts.length === 1) return workouts[0];

  const sorted = [...workouts].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const dow = new Date().getDay();
  const idx = dow === 0 ? sorted.length - 1 : dow - 1;
  return sorted[idx % sorted.length] ?? sorted[0];
}
