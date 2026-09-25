import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { logAudit } from "@/lib/audit/log";
import { jsonError } from "@/lib/api/json";
import { getSession } from "@/lib/auth/session";
import { START_TIME_PATTERN } from "@/lib/catalog/weekdays";
import { classActivities, classSlots } from "@/lib/db/schema";
import { withTenantTransaction } from "@/lib/db/with-tenant";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  weekday: z.number().int().min(1).max(5),
  startTime: z.string().regex(START_TIME_PATTERN),
});

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const current = error as { code?: string; cause?: { code?: string } };
  return current.code === "23505" || current.cause?.code === "23505";
}

export async function POST(
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
  const { id: activityId } = await ctx.params;
  if (!z.string().uuid().safeParse(activityId).success) {
    return jsonError(400, "ID inválido.");
  }

  let body: z.infer<typeof createSchema>;
  try {
    body = createSchema.parse(await request.json());
  } catch {
    return jsonError(400, "Informe dia e horário válidos.");
  }

  try {
    const slot = await withTenantTransaction(tenantId, async (tx) => {
      const [activity] = await tx
        .select({ id: classActivities.id })
        .from(classActivities)
        .where(
          and(
            eq(classActivities.id, activityId),
            eq(classActivities.tenantId, tenantId),
          ),
        )
        .limit(1);
      if (!activity) throw new Error("no_activity");
      const [row] = await tx
        .insert(classSlots)
        .values({
          tenantId,
          activityId,
          weekday: body.weekday,
          startTime: body.startTime,
        })
        .returning();
      return row!;
    });

    await logAudit({
      tenantId,
      actorUserId: session.sub,
      action: "class_slot.created",
      entity: "class_slot",
      entityId: slot.id,
      payload: { activityId, ...body },
    });

    return NextResponse.json({ slot }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "no_activity") {
      return jsonError(404, "Aula não encontrada.");
    }
    if (isUniqueViolation(error)) {
      return jsonError(409, "Esse horário já existe nessa aula.");
    }
    throw error;
  }
}
