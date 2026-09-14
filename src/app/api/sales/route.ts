import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { logAudit } from "@/lib/audit/log";
import { jsonError } from "@/lib/api/json";
import { getSession } from "@/lib/auth/session";
import { MANUAL_PAYMENT_METHODS } from "@/lib/billing/payment-methods";
import { sales, students } from "@/lib/db/schema";
import { withTenantTransaction } from "@/lib/db/with-tenant";
import {
  createDeskSale,
  loadSaleItemsBySaleIds,
} from "@/lib/services/inventory/operations";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  paymentMethod: z.enum(MANUAL_PAYMENT_METHODS),
  studentId: z.string().uuid().optional().nullable(),
  note: z.string().max(500).optional().nullable(),
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        quantity: z.number().int().positive().max(10_000),
      }),
    )
    .min(1)
    .max(50),
});

export async function GET(request: Request) {
  const session = await getSession();
  if (!session || session.typ !== "tenant" || !session.tid) {
    return jsonError(401, "Não autenticado.");
  }
  const tenantId = session.tid;
  const { searchParams } = new URL(request.url);
  const limit = Math.min(
    100,
    Math.max(1, Number(searchParams.get("limit") ?? 40) || 40),
  );

  const payload = await withTenantTransaction(tenantId, async (tx) => {
    const rows = await tx
      .select({
        id: sales.id,
        totalCents: sales.totalCents,
        paymentMethod: sales.paymentMethod,
        note: sales.note,
        createdAt: sales.createdAt,
        studentId: sales.studentId,
        studentName: students.fullName,
      })
      .from(sales)
      .leftJoin(students, eq(students.id, sales.studentId))
      .where(eq(sales.tenantId, tenantId))
      .orderBy(desc(sales.createdAt))
      .limit(limit);

    const items = await loadSaleItemsBySaleIds(
      tx,
      tenantId,
      rows.map((row) => row.id),
    );
    const itemsBySale = new Map<string, typeof items>();
    for (const item of items) {
      const list = itemsBySale.get(item.saleId) ?? [];
      list.push(item);
      itemsBySale.set(item.saleId, list);
    }

    return rows.map((row) => ({
      ...row,
      items: itemsBySale.get(row.id) ?? [],
    }));
  });

  return NextResponse.json({ items: payload });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session || session.typ !== "tenant" || !session.tid) {
    return jsonError(401, "Não autenticado como equipe da academia.");
  }
  const tenantId = session.tid;

  let body: z.infer<typeof createSchema>;
  try {
    body = createSchema.parse(await request.json());
  } catch {
    return jsonError(400, "Payload inválido.");
  }

  const result = await withTenantTransaction(tenantId, async (tx) =>
    createDeskSale(tx, {
      tenantId,
      actorUserId: session.sub,
      studentId: body.studentId ?? null,
      paymentMethod: body.paymentMethod,
      note: body.note,
      items: body.items,
    }),
  );

  if (!result.ok) {
    if (result.error === "empty") {
      return jsonError(400, "Inclua pelo menos um item.");
    }
    if (result.error === "not_found") {
      return jsonError(404, "Produto não encontrado.");
    }
    if (result.error === "inactive") {
      return jsonError(409, `${result.productName} está inativo e não pode ser vendido.`);
    }
    if (result.error === "insufficient") {
      return jsonError(
        409,
        `Estoque insuficiente de ${result.productName} (disponível: ${result.available}).`,
      );
    }
    return jsonError(400, "Não foi possível registrar a venda.");
  }

  await logAudit({
    tenantId,
    actorUserId: session.sub,
    action: "sale.created",
    entity: "sale",
    entityId: result.saleId,
    payload: {
      totalCents: result.totalCents,
      paymentMethod: body.paymentMethod,
      itemCount: body.items.length,
    },
  });

  return NextResponse.json(
    { saleId: result.saleId, totalCents: result.totalCents },
    { status: 201 },
  );
}
