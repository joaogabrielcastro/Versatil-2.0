import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { logAudit } from "@/lib/audit/log";
import { jsonError } from "@/lib/api/json";
import { getSession } from "@/lib/auth/session";
import { plans } from "@/lib/db/schema";
import { withTenantTransaction } from "@/lib/db/with-tenant";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  name: z.string().min(2).max(255).optional(),
  priceCents: z.number().int().nonnegative().optional(),
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

  const hasAnyField =
    body.name !== undefined ||
    body.priceCents !== undefined ||
    body.active !== undefined;
  if (!hasAnyField) {
    const current = await withTenantTransaction(tenantId, async (tx) => {
      const [row] = await tx
        .select()
        .from(plans)
        .where(and(eq(plans.id, id), eq(plans.tenantId, tenantId)))
        .limit(1);
      return row ?? null;
    });
    if (!current) {
      return jsonError(404, "Plano não encontrado.");
    }
    return NextResponse.json({ plan: current });
  }

  const updated = await withTenantTransaction(tenantId, async (tx) => {
    const [ex] = await tx
      .select({ id: plans.id })
      .from(plans)
      .where(and(eq(plans.id, id), eq(plans.tenantId, tenantId)))
      .limit(1);
    if (!ex) return null;
    const patch: {
      name?: string;
      priceCents?: number;
      active?: boolean;
    } = {};
    if (body.name !== undefined) patch.name = body.name;
    if (body.priceCents !== undefined) patch.priceCents = body.priceCents;
    if (body.active !== undefined) patch.active = body.active;
    const [row] = await tx.update(plans).set(patch).where(eq(plans.id, id)).returning();
    return row ?? null;
  });

  if (!updated) {
    return jsonError(404, "Plano não encontrado.");
  }

  await logAudit({
    tenantId,
    actorUserId: session.sub,
    action: "plan.updated",
    entity: "plan",
    entityId: id,
    payload: body,
  });

  return NextResponse.json({ plan: updated });
}
