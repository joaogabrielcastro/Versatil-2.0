import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError } from "@/lib/api/json";
import { studentWorkouts, students } from "@/lib/db/schema";
import { withTenantTransaction } from "@/lib/db/with-tenant";
import { resolveKioskTenantId } from "@/lib/kiosk/resolve-tenant";
import { pickWorkoutForToday } from "@/lib/workouts/pick-today";
import type { WorkoutExercise } from "@/lib/workouts/types";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: studentId } = await ctx.params;
  if (!z.string().uuid().safeParse(studentId).success) {
    return jsonError(400, "ID inválido.");
  }

  const slug = new URL(request.url).searchParams.get("tenantSlug");
  const resolved = await resolveKioskTenantId(slug);
  if (!resolved) {
    return jsonError(400, "Informe tenantSlug ou use o subdomínio da academia.");
  }

  const data = await withTenantTransaction(resolved.tenantId, async (tx) => {
    const [student] = await tx
      .select({
        id: students.id,
        fullName: students.fullName,
        cpf: students.cpf,
      })
      .from(students)
      .where(
        and(eq(students.id, studentId), eq(students.tenantId, resolved.tenantId)),
      )
      .limit(1);
    if (!student) return null;

    const workouts = await tx
      .select()
      .from(studentWorkouts)
      .where(
        and(
          eq(studentWorkouts.studentId, studentId),
          eq(studentWorkouts.tenantId, resolved.tenantId),
        ),
      )
      .orderBy(desc(studentWorkouts.updatedAt));

    const today = pickWorkoutForToday(workouts);
    if (!today) {
      return { student, workout: null, allWorkouts: [] as typeof workouts };
    }

    return {
      student,
      workout: {
        id: today.id,
        name: today.name,
        notes: today.notes,
        exercises: today.exercises as WorkoutExercise[],
        updatedAt: today.updatedAt,
      },
      allWorkouts: workouts.map((w) => ({ id: w.id, name: w.name })),
    };
  });

  if (!data) return jsonError(404, "Aluno não encontrado.");
  if (!data.workout) {
    return jsonError(
      404,
      "Este aluno ainda não tem treino atribuído. Peça ajuda na recepção.",
    );
  }

  const dayLabel = new Date().toLocaleDateString("pt-BR", {
    weekday: "long",
    timeZone: "America/Sao_Paulo",
  });

  return NextResponse.json({
    tenantSlug: resolved.slug,
    student: data.student,
    workout: data.workout,
    dayLabel,
    allWorkouts: data.allWorkouts,
  });
}
