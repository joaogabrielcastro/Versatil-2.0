import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { logAudit } from "@/lib/audit/log";
import { jsonError } from "@/lib/api/json";
import { getSession } from "@/lib/auth/session";
import { START_TIME_PATTERN } from "@/lib/catalog/weekdays";
import { classSlots } from "@/lib/db/schema";
import { withTenantTransaction } from "@/lib/db/with-tenant";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  weekday: z.number().int().min(1).max(5),
  startTime: z.string().regex(START_TIME_PATTERN),
});

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const current = error as { code?: string; cause?: { code?: string } };
  return current.code === "23505" || current.cause?.code === "23505";
}

async function adminSession() {
  const session = await getSession();
  if (!session || session.typ !== "tenant" || !session.tid) {
    return { error: jsonError(401, "Não autenticado.") } as const;
  }
  if (session.role !== "tenant_admin") {
    return { error: jsonError(403, "Apenas administrador da academia.") } as const;
  }
  return { session } as const;
}

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await adminSession();
  if ("error" in auth) return auth.error;
  const tenantId = auth.session.tid!;
  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) {
    return jsonError(400, "ID inválido.");
  }

  let body: z.infer<typeof patchSchema>;
  try {
    body = patchSchema.parse(await request.json());
  } catch {
    return jsonError(400, "Informe dia e horário válidos.");
  }

  try {
    const slot = await withTenantTransaction(tenantId, async (tx) => {
      const [row] = await tx
        .update(classSlots)
        .set({ weekday: body.weekday, startTime: body.startTime })
        .where(and(eq(classSlots.id, id), eq(classSlots.tenantId, tenantId)))
        .returning();
      return row ?? null;
    });
    if (!slot) return jsonError(404, "Horário não encontrado.");

    await logAudit({
      tenantId,
      actorUserId: auth.session.sub,
      action: "class_slot.updated",
      entity: "class_slot",
      entityId: id,
      payload: body,
    });

    return NextResponse.json({ slot });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return jsonError(409, "Esse horário já existe nessa aula.");
    }
    throw error;
  }
}

export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await adminSession();
  if ("error" in auth) return auth.error;
  const tenantId = auth.session.tid!;
  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) {
    return jsonError(400, "ID inválido.");
  }

  const removed = await withTenantTransaction(tenantId, async (tx) => {
    const [row] = await tx
      .delete(classSlots)
      .where(and(eq(classSlots.id, id), eq(classSlots.tenantId, tenantId)))
      .returning({ id: classSlots.id });
    return row ?? null;
  });
  if (!removed) return jsonError(404, "Horário não encontrado.");

  await logAudit({
    tenantId,
    actorUserId: auth.session.sub,
    action: "class_slot.deleted",
    entity: "class_slot",
    entityId: id,
  });

  return NextResponse.json({ ok: true });
}
