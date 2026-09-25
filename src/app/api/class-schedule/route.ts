import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { logAudit } from "@/lib/audit/log";
import { jsonError } from "@/lib/api/json";
import { getSession } from "@/lib/auth/session";
import { classActivities, classSlots } from "@/lib/db/schema";
import { withTenantTransaction } from "@/lib/db/with-tenant";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  name: z.string().trim().min(2).max(255),
  category: z.string().trim().min(2).max(64),
});

async function requireTenant() {
  const session = await getSession();
  if (!session || session.typ !== "tenant" || !session.tid) {
    return { error: jsonError(401, "Não autenticado.") } as const;
  }
  return { session } as const;
}

export async function GET() {
  const auth = await requireTenant();
  if ("error" in auth) return auth.error;
  const tenantId = auth.session.tid!;

  const items = await withTenantTransaction(tenantId, async (tx) => {
    const activities = await tx
      .select()
      .from(classActivities)
      .where(eq(classActivities.tenantId, tenantId))
      .orderBy(asc(classActivities.sortOrder), asc(classActivities.name));
    const slots = await tx
      .select()
      .from(classSlots)
      .where(eq(classSlots.tenantId, tenantId))
      .orderBy(asc(classSlots.weekday), asc(classSlots.startTime));
    return activities.map((activity) => ({
      ...activity,
      slots: slots.filter((slot) => slot.activityId === activity.id),
    }));
  });

  return NextResponse.json({ items });
}

export async function POST(request: Request) {
  const auth = await requireTenant();
  if ("error" in auth) return auth.error;
  if (auth.session.role !== "tenant_admin") {
    return jsonError(403, "Apenas administrador da academia.");
  }
  const tenantId = auth.session.tid!;

  let body: z.infer<typeof createSchema>;
  try {
    body = createSchema.parse(await request.json());
  } catch {
    return jsonError(400, "Informe nome e categoria da aula.");
  }

  const activity = await withTenantTransaction(tenantId, async (tx) => {
    const [row] = await tx
      .insert(classActivities)
      .values({
        tenantId,
        name: body.name,
        category: body.category,
        active: true,
      })
      .returning();
    return row!;
  });

  await logAudit({
    tenantId,
    actorUserId: auth.session.sub,
    action: "class_activity.created",
    entity: "class_activity",
    entityId: activity.id,
    payload: { name: body.name, category: body.category },
  });

  return NextResponse.json({ activity }, { status: 201 });
}
