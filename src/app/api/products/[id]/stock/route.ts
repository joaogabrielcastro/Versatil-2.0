import { NextResponse } from "next/server";
import { z } from "zod";
import { logAudit } from "@/lib/audit/log";
import { jsonError } from "@/lib/api/json";
import { getSession } from "@/lib/auth/session";
import { withTenantTransaction } from "@/lib/db/with-tenant";
import { applyStockMovement } from "@/lib/services/inventory/operations";

export const dynamic = "force-dynamic";

const stockSchema = z.object({
  type: z.enum(["in", "out", "adjust"]),
  quantity: z.number().int().nonnegative().max(1_000_000),
  reason: z.string().max(255).optional().nullable(),
});

export async function POST(
  request: Request,
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

  let body: z.infer<typeof stockSchema>;
  try {
    body = stockSchema.parse(await request.json());
  } catch {
    return jsonError(400, "Payload inválido.");
  }

  if (body.type === "adjust" && session.role !== "tenant_admin") {
    return jsonError(403, "Apenas administrador pode ajustar o estoque final.");
  }

  const result = await withTenantTransaction(tenantId, async (tx) =>
    applyStockMovement(tx, {
      tenantId,
      productId: id,
      type: body.type,
      quantity: body.quantity,
      reason: body.reason,
      actorUserId: session.sub,
    }),
  );

  if (!result.ok) {
    if (result.error === "not_found") {
      return jsonError(404, "Produto não encontrado.");
    }
    if (result.error === "insufficient") {
      return jsonError(409, "Estoque insuficiente para essa saída.");
    }
    if (result.error === "unchanged") {
      return jsonError(400, "O estoque já está nesse valor.");
    }
    return jsonError(400, "Quantidade inválida.");
  }

  await logAudit({
    tenantId,
    actorUserId: session.sub,
    action: "product.stock_moved",
    entity: "product",
    entityId: id,
    payload: {
      type: body.type,
      quantity: body.quantity,
      resultingQuantity: result.product.quantityOnHand,
    },
  });

  return NextResponse.json({
    product: result.product,
    movement: result.movement,
  });
}
