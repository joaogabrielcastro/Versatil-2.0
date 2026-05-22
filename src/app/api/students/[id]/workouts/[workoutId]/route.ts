import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { logAudit } from "@/lib/audit/log";
import { jsonError } from "@/lib/api/json";
import { getSession } from "@/lib/auth/session";
import { studentWorkouts } from "@/lib/db/schema";
import { withTenantTransaction } from "@/lib/db/with-tenant";
import { workoutExercisesSchema } from "@/lib/workouts/types";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  name: z.string().min(2).max(255).optional(),
  exercises: workoutExercisesSchema.optional(),
  notes: z.string().max(2000).optional().nullable(),
});

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string; workoutId: string }> },
) {
  const session = await getSession();
  if (!session || session.typ !== "tenant" || !session.tid) {
    return jsonError(401, "Não autenticado.");
  }
  const tenantId = session.tid;
  const { id: studentId, workoutId } = await ctx.params;

  const row = await withTenantTransaction(tenantId, async (tx) => {
    const [r] = await tx
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
    return r ?? null;
  });

  if (!row) return jsonError(404, "Treino não encontrado.");
  return NextResponse.json({ workout: row });
}

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string; workoutId: string }> },
) {
  const session = await getSession();
  if (!session || session.typ !== "tenant" || !session.tid) {
    return jsonError(401, "Não autenticado.");
  }
  const tenantId = session.tid;
  const { id: studentId, workoutId } = await ctx.params;

  let body: z.infer<typeof patchSchema>;
  try {
    body = patchSchema.parse(await request.json());
  } catch {
    return jsonError(400, "Payload inválido.");
  }

  const updated = await withTenantTransaction(tenantId, async (tx) => {
    const [existing] = await tx
      .select({ id: studentWorkouts.id })
      .from(studentWorkouts)
      .where(
        and(
          eq(studentWorkouts.id, workoutId),
          eq(studentWorkouts.studentId, studentId),
          eq(studentWorkouts.tenantId, tenantId),
        ),
      )
      .limit(1);
    if (!existing) return null;

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (body.name !== undefined) patch.name = body.name;
    if (body.exercises !== undefined) patch.exercises = body.exercises;
    if (body.notes !== undefined) patch.notes = body.notes;

    const [row] = await tx
      .update(studentWorkouts)
      .set(patch)
      .where(eq(studentWorkouts.id, workoutId))
      .returning();
    return row ?? null;
  });

  if (!updated) return jsonError(404, "Treino não encontrado.");

  await logAudit({
    tenantId,
    actorUserId: session.sub,
    action: "student_workout.updated",
    entity: "student_workout",
    entityId: workoutId,
    payload: body,
  });

  return NextResponse.json({ workout: updated });
}

export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ id: string; workoutId: string }> },
) {
  const session = await getSession();
  if (!session || session.typ !== "tenant" || !session.tid) {
    return jsonError(401, "Não autenticado.");
  }
  const tenantId = session.tid;
  const { id: studentId, workoutId } = await ctx.params;

  const deleted = await withTenantTransaction(tenantId, async (tx) => {
    const [row] = await tx
      .delete(studentWorkouts)
      .where(
        and(
          eq(studentWorkouts.id, workoutId),
          eq(studentWorkouts.studentId, studentId),
          eq(studentWorkouts.tenantId, tenantId),
        ),
      )
      .returning({ id: studentWorkouts.id });
    return row ?? null;
  });

  if (!deleted) return jsonError(404, "Treino não encontrado.");

  await logAudit({
    tenantId,
    actorUserId: session.sub,
    action: "student_workout.deleted",
    entity: "student_workout",
    entityId: workoutId,
  });

  return NextResponse.json({ ok: true });
}
