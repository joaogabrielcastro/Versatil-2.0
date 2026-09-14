import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { logAudit } from "@/lib/audit/log";
import { jsonError } from "@/lib/api/json";
import { getSession } from "@/lib/auth/session";
import { products } from "@/lib/db/schema";
import { withTenantTransaction } from "@/lib/db/with-tenant";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  name: z.string().min(2).max(255).optional(),
  sku: z.string().max(64).optional().nullable(),
  category: z.string().max(64).optional().nullable(),
  priceCents: z.number().int().nonnegative().max(10_000_000).optional(),
  costCents: z
    .number()
    .int()
    .nonnegative()
    .max(10_000_000)
    .optional()
    .nullable(),
  lowStockThreshold: z.number().int().nonnegative().max(1_000_000).optional(),
  active: z.boolean().optional(),
});

function blankToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
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
    body.sku !== undefined ||
    body.category !== undefined ||
    body.priceCents !== undefined ||
    body.costCents !== undefined ||
    body.lowStockThreshold !== undefined ||
    body.active !== undefined;
  if (!hasAnyField) {
    return jsonError(400, "Nenhum campo para atualizar.");
  }

  try {
    const updated = await withTenantTransaction(tenantId, async (tx) => {
      const [ex] = await tx
        .select({ id: products.id })
        .from(products)
        .where(and(eq(products.id, id), eq(products.tenantId, tenantId)))
        .limit(1);
      if (!ex) return null;

      const patch: {
        name?: string;
        sku?: string | null;
        category?: string | null;
        priceCents?: number;
        costCents?: number | null;
        lowStockThreshold?: number;
        active?: boolean;
        updatedAt: Date;
      } = { updatedAt: new Date() };
      if (body.name !== undefined) patch.name = body.name.trim();
      if (body.sku !== undefined) patch.sku = blankToNull(body.sku);
      if (body.category !== undefined) patch.category = blankToNull(body.category);
      if (body.priceCents !== undefined) patch.priceCents = body.priceCents;
      if (body.costCents !== undefined) patch.costCents = body.costCents;
      if (body.lowStockThreshold !== undefined) {
        patch.lowStockThreshold = body.lowStockThreshold;
      }
      if (body.active !== undefined) patch.active = body.active;

      const [row] = await tx
        .update(products)
        .set(patch)
        .where(and(eq(products.id, id), eq(products.tenantId, tenantId)))
        .returning();
      return row ?? null;
    });

    if (!updated) {
      return jsonError(404, "Produto não encontrado.");
    }

    await logAudit({
      tenantId,
      actorUserId: session.sub,
      action: "product.updated",
      entity: "product",
      entityId: id,
      payload: body,
    });

    return NextResponse.json({ product: updated });
  } catch (err: unknown) {
    const code =
      err && typeof err === "object" && "code" in err
        ? String((err as { code: string }).code)
        : "";
    if (code === "23505") {
      return jsonError(409, "Já existe um produto com este código (SKU).");
    }
    throw err;
  }
}
