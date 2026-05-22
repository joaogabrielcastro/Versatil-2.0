import type { WorkoutExercise } from "@/lib/workouts/types";

function formatPrintedAt(d: Date) {
  return d.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function exerciseDetail(ex: WorkoutExercise): string {
  const parts: string[] = [];
  if (ex.sets) parts.push(`Séries: ${ex.sets}`);
  if (ex.reps) parts.push(`Reps: ${ex.reps}`);
  if (ex.load) parts.push(`Carga: ${ex.load}`);
  if (ex.rest) parts.push(`Desc: ${ex.rest}`);
  return parts.join(" · ") || "—";
}

export function PrintWorkoutSheet({
  studentName,
  studentCpf,
  workoutName,
  notes,
  exercises,
  printedAt,
}: {
  studentName: string;
  studentCpf: string;
  workoutName: string;
  notes: string | null;
  exercises: WorkoutExercise[];
  printedAt: Date;
}) {
  return (
    <article className="thermal-print" aria-label="Cupom de treino">
      <div className="thermal-print__inner">
        <p className="thermal-print__brand">TECNOFIT · TREINO</p>
        <p className="thermal-print__rule">================================</p>

        <h1 className="thermal-print__title">{workoutName}</h1>

        <p className="thermal-print__rule">--------------------------------</p>
        <p className="thermal-print__line">
          <span className="thermal-print__label">Aluno:</span> {studentName}
        </p>
        <p className="thermal-print__line">
          <span className="thermal-print__label">CPF:</span> {studentCpf}
        </p>
        <p className="thermal-print__line thermal-print__muted">
          {formatPrintedAt(printedAt)}
        </p>

        {notes ? (
          <>
            <p className="thermal-print__rule">--------------------------------</p>
            <p className="thermal-print__notes">{notes}</p>
          </>
        ) : null}

        <p className="thermal-print__rule">--------------------------------</p>

        <ol className="thermal-print__exercises">
          {exercises.map((ex, i) => (
            <li key={i} className="thermal-print__exercise">
              <p className="thermal-print__ex-name">
                {i + 1}. {ex.name}
              </p>
              <p className="thermal-print__ex-detail">{exerciseDetail(ex)}</p>
              {ex.notes ? (
                <p className="thermal-print__ex-notes">{ex.notes}</p>
              ) : null}
              <p className="thermal-print__check">[ ] Concluído</p>
            </li>
          ))}
        </ol>

        <p className="thermal-print__rule">================================</p>
        <p className="thermal-print__footer">
          Ajuste cargas com a equipe.
          <br />
          Bons treinos!
        </p>
        <p className="thermal-print__rule">================================</p>
      </div>
    </article>
  );
}
