import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError } from "@/lib/api/json";
import { getSession } from "@/lib/auth/session";
import { products, stockMovements } from "@/lib/db/schema";
import { withTenantTransaction } from "@/lib/db/with-tenant";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session || session.typ !== "tenant" || !session.tid) {
    return jsonError(401, "Não autenticado.");
  }
  const tenantId = session.tid;
  const { searchParams } = new URL(request.url);
  const productId = searchParams.get("productId");
  if (productId && !z.string().uuid().safeParse(productId).success) {
    return jsonError(400, "Produto inválido.");
  }
  const limit = Math.min(
    200,
    Math.max(1, Number(searchParams.get("limit") ?? 80) || 80),
  );

  const items = await withTenantTransaction(tenantId, async (tx) => {
    const whereExpr = productId
      ? and(
          eq(stockMovements.tenantId, tenantId),
          eq(stockMovements.productId, productId),
        )
      : eq(stockMovements.tenantId, tenantId);

    return tx
      .select({
        id: stockMovements.id,
        productId: stockMovements.productId,
        productName: products.name,
        type: stockMovements.type,
        quantity: stockMovements.quantity,
        resultingQuantity: stockMovements.resultingQuantity,
        reason: stockMovements.reason,
        saleId: stockMovements.saleId,
        createdAt: stockMovements.createdAt,
      })
      .from(stockMovements)
      .innerJoin(products, eq(products.id, stockMovements.productId))
      .where(whereExpr)
      .orderBy(desc(stockMovements.createdAt))
      .limit(limit);
  });

  return NextResponse.json({ items });
}
