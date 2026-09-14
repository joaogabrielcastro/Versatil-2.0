import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { logAudit } from "@/lib/audit/log";
import { jsonError } from "@/lib/api/json";
import { getSession } from "@/lib/auth/session";
import { products, stockMovements } from "@/lib/db/schema";
import { withTenantTransaction } from "@/lib/db/with-tenant";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  name: z.string().min(2).max(255),
  sku: z.string().max(64).optional().nullable(),
  category: z.string().max(64).optional().nullable(),
  priceCents: z.number().int().nonnegative().max(10_000_000),
  costCents: z.number().int().nonnegative().max(10_000_000).optional().nullable(),
  quantityOnHand: z.number().int().nonnegative().max(1_000_000).optional(),
  lowStockThreshold: z.number().int().nonnegative().max(1_000_000).optional(),
});

function blankToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export async function GET() {
  const session = await getSession();
  if (!session || session.typ !== "tenant" || !session.tid) {
    return jsonError(401, "Não autenticado.");
  }
  const tenantId = session.tid;

  const items = await withTenantTransaction(tenantId, async (tx) => {
    return tx
      .select()
      .from(products)
      .where(eq(products.tenantId, tenantId))
      .orderBy(asc(products.name));
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

  const sku = blankToNull(body.sku);
  const category = blankToNull(body.category);
  const initialQty = body.quantityOnHand ?? 0;

  try {
    const [row] = await withTenantTransaction(tenantId, async (tx) => {
      const [product] = await tx
        .insert(products)
        .values({
          tenantId,
          name: body.name.trim(),
          sku,
          category,
          priceCents: body.priceCents,
          costCents: body.costCents ?? null,
          quantityOnHand: initialQty,
          lowStockThreshold: body.lowStockThreshold ?? 5,
        })
        .returning();

      if (initialQty > 0 && product) {
        await tx.insert(stockMovements).values({
          tenantId,
          productId: product.id,
          type: "in",
          quantity: initialQty,
          resultingQuantity: initialQty,
          reason: "Estoque inicial",
          actorUserId: session.sub,
        });
      }

      return [product];
    });

    await logAudit({
      tenantId,
      actorUserId: session.sub,
      action: "product.created",
      entity: "product",
      entityId: row!.id,
      payload: { name: body.name, quantityOnHand: initialQty },
    });

    return NextResponse.json({ product: row }, { status: 201 });
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
