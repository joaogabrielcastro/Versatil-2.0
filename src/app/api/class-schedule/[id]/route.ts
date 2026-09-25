import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { logAudit } from "@/lib/audit/log";
import { jsonError } from "@/lib/api/json";
import { getSession } from "@/lib/auth/session";
import { classActivities } from "@/lib/db/schema";
import { withTenantTransaction } from "@/lib/db/with-tenant";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  name: z.string().trim().min(2).max(255).optional(),
  category: z.string().trim().min(2).max(64).optional(),
  active: z.boolean().optional(),
});

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
  if (!z.string().uuid().safeParse(id).success) {
    return jsonError(400, "ID inválido.");
  }

  let body: z.infer<typeof patchSchema>;
  try {
    body = patchSchema.parse(await request.json());
  } catch {
    return jsonError(400, "Payload inválido.");
  }
  if (
    body.name === undefined &&
    body.category === undefined &&
    body.active === undefined
  ) {
    return jsonError(400, "Nada para alterar.");
  }

  const updated = await withTenantTransaction(tenantId, async (tx) => {
    const [row] = await tx
      .update(classActivities)
      .set({
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.category !== undefined ? { category: body.category } : {}),
        ...(body.active !== undefined ? { active: body.active } : {}),
      })
      .where(and(eq(classActivities.id, id), eq(classActivities.tenantId, tenantId)))
      .returning();
    return row ?? null;
  });

  if (!updated) return jsonError(404, "Aula não encontrada.");

  await logAudit({
    tenantId,
    actorUserId: session.sub,
    action: "class_activity.updated",
    entity: "class_activity",
    entityId: id,
    payload: body,
  });

  return NextResponse.json({ activity: updated });
}
