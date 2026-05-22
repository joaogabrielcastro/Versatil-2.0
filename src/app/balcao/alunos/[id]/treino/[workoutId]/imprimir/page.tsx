import { and, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { PrintToolbar } from "@/components/balcao/print-toolbar";
import { PrintWorkoutSheet } from "@/components/balcao/print-workout-sheet";
import { getSession } from "@/lib/auth/session";
import { studentWorkouts, students } from "@/lib/db/schema";
import { withTenantTransaction } from "@/lib/db/with-tenant";
import type { WorkoutExercise } from "@/lib/workouts/types";

export const dynamic = "force-dynamic";

export default async function ImprimirTreinoPage({
  params,
}: {
  params: Promise<{ id: string; workoutId: string }>;
}) {
  const session = await getSession();
  if (!session || session.typ !== "tenant" || !session.tid) {
    redirect("/login");
  }
  const tenantId = session.tid;
  const { id: studentId, workoutId } = await params;

  const data = await withTenantTransaction(tenantId, async (tx) => {
    const [student] = await tx
      .select({ fullName: students.fullName, cpf: students.cpf })
      .from(students)
      .where(and(eq(students.id, studentId), eq(students.tenantId, tenantId)))
      .limit(1);
    if (!student) return null;

    const [workout] = await tx
      .select()
      .from(studentWorkouts)
      .where(
        and(
          eq(studentWorkouts.id, workoutId),
          eq(studentWorkouts.studentId, studentId),
          eq(studentWorkouts.tenantId, tenantId),
        ),
      )
      .limit(1);
    if (!workout) return null;

    return {
      student,
      workout: {
        name: workout.name,
        notes: workout.notes,
        exercises: workout.exercises as WorkoutExercise[],
      },
    };
  });

  if (!data) notFound();

  return (
    <>
      <PrintToolbar backHref={`/balcao/alunos/${studentId}`} />
      <PrintWorkoutSheet
        studentName={data.student.fullName}
        studentCpf={data.student.cpf}
        workoutName={data.workout.name}
        notes={data.workout.notes}
        exercises={data.workout.exercises}
        printedAt={new Date()}
      />
    </>
  );
}
