import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { logAudit } from "@/lib/audit/log";
import { jsonError } from "@/lib/api/json";
import { getSession } from "@/lib/auth/session";
import { studentWorkouts, students, workoutTemplates } from "@/lib/db/schema";
import { withTenantTransaction } from "@/lib/db/with-tenant";
import { workoutExercisesSchema } from "@/lib/workouts/types";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  templateId: z.string().uuid().optional(),
  name: z.string().min(2).max(255).optional(),
  exercises: workoutExercisesSchema.optional(),
  notes: z.string().max(2000).optional().nullable(),
});

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session || session.typ !== "tenant" || !session.tid) {
    return jsonError(401, "Não autenticado.");
  }
  const tenantId = session.tid;
  const { id: studentId } = await ctx.params;

  const items = await withTenantTransaction(tenantId, async (tx) => {
    const [student] = await tx
      .select({ id: students.id })
      .from(students)
      .where(and(eq(students.id, studentId), eq(students.tenantId, tenantId)))
      .limit(1);
    if (!student) return null;

    return tx
      .select()
      .from(studentWorkouts)
      .where(
        and(
          eq(studentWorkouts.studentId, studentId),
          eq(studentWorkouts.tenantId, tenantId),
        ),
      )
      .orderBy(desc(studentWorkouts.updatedAt));
  });

  if (items === null) return jsonError(404, "Aluno não encontrado.");
  return NextResponse.json({ items });
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session || session.typ !== "tenant" || !session.tid) {
    return jsonError(401, "Não autenticado.");
  }
  const tenantId = session.tid;
  const { id: studentId } = await ctx.params;

  let body: z.infer<typeof createSchema>;
  try {
    body = createSchema.parse(await request.json());
  } catch {
    return jsonError(400, "Payload inválido.");
  }

  const created = await withTenantTransaction(tenantId, async (tx) => {
    const [student] = await tx
      .select({ id: students.id })
      .from(students)
      .where(and(eq(students.id, studentId), eq(students.tenantId, tenantId)))
      .limit(1);
    if (!student) return null;

    let name = body.name?.trim();
    let exercises = body.exercises;
    let templateId: string | null = body.templateId ?? null;

    if (body.templateId) {
      const [tpl] = await tx
        .select()
        .from(workoutTemplates)
        .where(
          and(
            eq(workoutTemplates.id, body.templateId),
            eq(workoutTemplates.tenantId, tenantId),
            eq(workoutTemplates.active, true),
          ),
        )
        .limit(1);
      if (!tpl) return { error: "TEMPLATE_NOT_FOUND" as const };
      if (!name) name = tpl.name;
      if (!exercises) exercises = tpl.exercises as typeof exercises;
      templateId = tpl.id;
    }

    if (!name || !exercises) {
      return { error: "MISSING_FIELDS" as const };
    }

    const parsed = workoutExercisesSchema.safeParse(exercises);
    if (!parsed.success) return { error: "INVALID_EXERCISES" as const };

    const [row] = await tx
      .insert(studentWorkouts)
      .values({
        tenantId,
        studentId,
        templateId,
        name,
        exercises: parsed.data,
        notes: body.notes ?? null,
      })
      .returning();
    return { row };
  });

  if (!created) return jsonError(404, "Aluno não encontrado.");
  if ("error" in created) {
    if (created.error === "TEMPLATE_NOT_FOUND") {
      return jsonError(404, "Modelo de treino não encontrado.");
    }
    return jsonError(400, "Informe modelo ou nome + exercícios.");
  }

  await logAudit({
    tenantId,
    actorUserId: session.sub,
    action: "student_workout.created",
    entity: "student_workout",
    entityId: created.row!.id,
    payload: { studentId, templateId: body.templateId },
  });

  return NextResponse.json({ workout: created.row }, { status: 201 });
}
