import { asc, desc } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { logAudit } from "@/lib/audit/log";
import { jsonError } from "@/lib/api/json";
import { getSession } from "@/lib/auth/session";
import { workoutTemplates } from "@/lib/db/schema";
import { withTenantTransaction } from "@/lib/db/with-tenant";
import { workoutExercisesSchema } from "@/lib/workouts/types";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  name: z.string().min(2).max(255),
  description: z.string().max(2000).optional().nullable(),
  exercises: workoutExercisesSchema,
  sortOrder: z.number().int().optional(),
});

export async function GET() {
  const session = await getSession();
  if (!session || session.typ !== "tenant" || !session.tid) {
    return jsonError(401, "Não autenticado.");
  }
  const tenantId = session.tid;

  const items = await withTenantTransaction(tenantId, async (tx) => {
    return tx
      .select()
      .from(workoutTemplates)
      .orderBy(asc(workoutTemplates.sortOrder), desc(workoutTemplates.createdAt));
  });

  return NextResponse.json({ items });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session || session.typ !== "tenant" || !session.tid) {
    return jsonError(401, "Não autenticado.");
  }
  if (session.role !== "tenant_admin") {
    return jsonError(403, "Apenas administrador da academia.");
  }
  const tenantId = session.tid;

  let body: z.infer<typeof createSchema>;
  try {
    body = createSchema.parse(await request.json());
  } catch {
    return jsonError(400, "Payload inválido.");
  }

  const [row] = await withTenantTransaction(tenantId, async (tx) => {
    const [p] = await tx
      .insert(workoutTemplates)
      .values({
        tenantId,
        name: body.name,
        description: body.description ?? null,
        exercises: body.exercises,
        isPreset: false,
        sortOrder: body.sortOrder ?? 100,
      })
      .returning();
    return [p];
  });

  await logAudit({
    tenantId,
    actorUserId: session.sub,
    action: "workout_template.created",
    entity: "workout_template",
    entityId: row!.id,
    payload: { name: body.name },
  });

  return NextResponse.json({ template: row }, { status: 201 });
}
