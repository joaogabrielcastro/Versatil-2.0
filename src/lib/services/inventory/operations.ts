import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import {
  products,
  saleItems,
  sales,
  stockMovements,
  students,
} from "@/lib/db/schema";
import type { DbTransaction } from "@/lib/db/with-tenant";
import {
  computeStockAfterMovement,
  lineTotalCents,
  mergeSaleLines,
  type StockMovementType,
} from "./stock-logic";

export async function applyStockMovement(
  tx: DbTransaction,
  input: {
    tenantId: string;
    productId: string;
    type: Exclude<StockMovementType, "sale">;
    quantity: number;
    reason?: string | null;
    actorUserId?: string | null;
  },
) {
  const [product] = await tx
    .select()
    .from(products)
    .where(
      and(
        eq(products.id, input.productId),
        eq(products.tenantId, input.tenantId),
      ),
    )
    .for("update")
    .limit(1);

  if (!product) {
    return { ok: false as const, error: "not_found" as const };
  }

  const next = computeStockAfterMovement({
    current: product.quantityOnHand,
    type: input.type,
    quantity: input.quantity,
  });
  if (!next.ok) {
    return { ok: false as const, error: next.reason };
  }

  const [updated] = await tx
    .update(products)
    .set({ quantityOnHand: next.resulting, updatedAt: new Date() })
    .where(
      and(eq(products.id, product.id), eq(products.tenantId, input.tenantId)),
    )
    .returning();

  const [movement] = await tx
    .insert(stockMovements)
    .values({
      tenantId: input.tenantId,
      productId: product.id,
      type: input.type,
      quantity: next.recordedQuantity,
      resultingQuantity: next.resulting,
      reason: input.reason?.trim() || null,
      actorUserId: input.actorUserId ?? null,
    })
    .returning();

  return {
    ok: true as const,
    product: updated!,
    movement: movement!,
  };
}

export type CreateSaleError =
  | { error: "empty" }
  | { error: "invalid" }
  | { error: "not_found"; productId: string }
  | { error: "inactive"; productName: string }
  | { error: "insufficient"; productName: string; available: number };

export async function createDeskSale(
  tx: DbTransaction,
  input: {
    tenantId: string;
    actorUserId?: string | null;
    studentId?: string | null;
    paymentMethod: string;
    note?: string | null;
    items: { productId: string; quantity: number }[];
  },
): Promise<
  | { ok: true; saleId: string; totalCents: number }
  | { ok: false } & CreateSaleError
> {
  const lines = mergeSaleLines(input.items);
  if (lines.length === 0) {
    return { ok: false, error: "empty" };
  }

  if (input.studentId) {
    const [student] = await tx
      .select({ id: students.id })
      .from(students)
      .where(
        and(
          eq(students.id, input.studentId),
          eq(students.tenantId, input.tenantId),
        ),
      )
      .limit(1);
    if (!student) {
      return { ok: false, error: "invalid" };
    }
  }

  const prepared: {
    product: typeof products.$inferSelect;
    quantity: number;
    resulting: number;
    recordedQuantity: number;
    lineTotal: number;
  }[] = [];

  for (const line of lines) {
    const [product] = await tx
      .select()
      .from(products)
      .where(
        and(
          eq(products.id, line.productId),
          eq(products.tenantId, input.tenantId),
        ),
      )
      .for("update")
      .limit(1);

    if (!product) {
      return { ok: false, error: "not_found", productId: line.productId };
    }
    if (!product.active) {
      return { ok: false, error: "inactive", productName: product.name };
    }

    const next = computeStockAfterMovement({
      current: product.quantityOnHand,
      type: "sale",
      quantity: line.quantity,
    });
    if (!next.ok) {
      if (next.reason === "insufficient") {
        return {
          ok: false,
          error: "insufficient",
          productName: product.name,
          available: product.quantityOnHand,
        };
      }
      return { ok: false, error: "invalid" };
    }

    const lineTotal = lineTotalCents(product.priceCents, line.quantity);
    if (!Number.isSafeInteger(lineTotal) || lineTotal > 2_147_483_647) {
      return { ok: false, error: "invalid" };
    }

    prepared.push({
      product,
      quantity: line.quantity,
      resulting: next.resulting,
      recordedQuantity: next.recordedQuantity,
      lineTotal,
    });
  }

  const totalCents = prepared.reduce((sum, row) => sum + row.lineTotal, 0);
  if (!Number.isSafeInteger(totalCents) || totalCents > 2_147_483_647) {
    return { ok: false, error: "invalid" };
  }

  const [sale] = await tx
    .insert(sales)
    .values({
      tenantId: input.tenantId,
      studentId: input.studentId ?? null,
      actorUserId: input.actorUserId ?? null,
      paymentMethod: input.paymentMethod,
      totalCents,
      note: input.note?.trim() || null,
    })
    .returning({ id: sales.id });

  const saleId = sale!.id;

  for (const row of prepared) {
    await tx
      .update(products)
      .set({ quantityOnHand: row.resulting, updatedAt: new Date() })
      .where(
        and(
          eq(products.id, row.product.id),
          eq(products.tenantId, input.tenantId),
        ),
      );

    await tx.insert(saleItems).values({
      tenantId: input.tenantId,
      saleId,
      productId: row.product.id,
      productName: row.product.name,
      quantity: row.quantity,
      unitPriceCents: row.product.priceCents,
      totalCents: row.lineTotal,
    });

    await tx.insert(stockMovements).values({
      tenantId: input.tenantId,
      productId: row.product.id,
      type: "sale",
      quantity: row.recordedQuantity,
      resultingQuantity: row.resulting,
      reason: "Venda no balcão",
      actorUserId: input.actorUserId ?? null,
      saleId,
    });
  }

  return { ok: true, saleId, totalCents };
}

export async function loadSaleItemsBySaleIds(
  tx: DbTransaction,
  tenantId: string,
  saleIds: string[],
) {
  if (saleIds.length === 0) return [];
  return tx
    .select({
      id: saleItems.id,
      saleId: saleItems.saleId,
      productId: saleItems.productId,
      productName: saleItems.productName,
      quantity: saleItems.quantity,
      unitPriceCents: saleItems.unitPriceCents,
      totalCents: saleItems.totalCents,
    })
    .from(saleItems)
    .where(
      and(
        eq(saleItems.tenantId, tenantId),
        inArray(saleItems.saleId, saleIds),
      ),
    );
}
