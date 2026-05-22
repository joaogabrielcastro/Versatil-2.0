import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { logAudit } from "@/lib/audit/log";
import { jsonError } from "@/lib/api/json";
import { getSession } from "@/lib/auth/session";
import { workoutTemplates } from "@/lib/db/schema";
import { withTenantTransaction } from "@/lib/db/with-tenant";
import { workoutExercisesSchema } from "@/lib/workouts/types";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  name: z.string().min(2).max(255).optional(),
  description: z.string().max(2000).optional().nullable(),
  exercises: workoutExercisesSchema.optional(),
  active: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
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
  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) {
    return jsonError(400, "ID inválido.");
  }

  const row = await withTenantTransaction(tenantId, async (tx) => {
    const [r] = await tx
      .select()
      .from(workoutTemplates)
      .where(and(eq(workoutTemplates.id, id), eq(workoutTemplates.tenantId, tenantId)))
      .limit(1);
    return r ?? null;
  });

  if (!row) return jsonError(404, "Modelo não encontrado.");
  return NextResponse.json({ template: row });
}

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session || session.typ !== "tenant" || !session.tid) {
    return jsonError(401, "Não autenticado.");
  }
  if (session.role !== "tenant_admin") {
    return jsonError(403, "Apenas administrador da academia.");
  }
  const tenantId = session.tid;
  const { id } = await ctx.params;

  let body: z.infer<typeof patchSchema>;
  try {
    body = patchSchema.parse(await request.json());
  } catch {
    return jsonError(400, "Payload inválido.");
  }

  const updated = await withTenantTransaction(tenantId, async (tx) => {
    const [existing] = await tx
      .select({ id: workoutTemplates.id })
      .from(workoutTemplates)
      .where(and(eq(workoutTemplates.id, id), eq(workoutTemplates.tenantId, tenantId)))
      .limit(1);
    if (!existing) return null;

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (body.name !== undefined) patch.name = body.name;
    if (body.description !== undefined) patch.description = body.description;
    if (body.exercises !== undefined) patch.exercises = body.exercises;
    if (body.active !== undefined) patch.active = body.active;
    if (body.sortOrder !== undefined) patch.sortOrder = body.sortOrder;

    const [row] = await tx
      .update(workoutTemplates)
      .set(patch)
      .where(eq(workoutTemplates.id, id))
      .returning();
    return row ?? null;
  });

  if (!updated) return jsonError(404, "Modelo não encontrado.");

  await logAudit({
    tenantId,
    actorUserId: session.sub,
    action: "workout_template.updated",
    entity: "workout_template",
    entityId: id,
    payload: body,
  });

  return NextResponse.json({ template: updated });
}
