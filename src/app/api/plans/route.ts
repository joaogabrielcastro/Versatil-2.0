import { desc } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { logAudit } from "@/lib/audit/log";
import { jsonError } from "@/lib/api/json";
import { getSession } from "@/lib/auth/session";
import { plans } from "@/lib/db/schema";
import { withTenantTransaction } from "@/lib/db/with-tenant";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  name: z.string().min(2).max(255),
  priceCents: z.number().int().nonnegative(),
  billingInterval: z.enum(["monthly", "semesterly", "yearly"]).optional(),
});

export async function GET() {
  const session = await getSession();
  if (!session || session.typ !== "tenant" || !session.tid) {
    return jsonError(401, "Não autenticado.");
  }
  const tenantId = session.tid;

  const items = await withTenantTransaction(tenantId, async (tx) => {
    return tx.select().from(plans).orderBy(desc(plans.createdAt));
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

  const [row] = await withTenantTransaction(tenantId, async (tx) => {
    const [p] = await tx
      .insert(plans)
      .values({
        tenantId,
        name: body.name,
        priceCents: body.priceCents,
        billingInterval: body.billingInterval ?? "monthly",
      })
      .returning();
    return [p];
  });

  await logAudit({
    tenantId,
    actorUserId: session.sub,
    action: "plan.created",
    entity: "plan",
    entityId: row!.id,
    payload: { name: body.name },
  });

  return NextResponse.json({ plan: row }, { status: 201 });
}
