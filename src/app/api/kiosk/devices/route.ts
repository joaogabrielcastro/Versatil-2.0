import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { logAudit } from "@/lib/audit/log";
import { jsonError } from "@/lib/api/json";
import { getSession } from "@/lib/auth/session";
import { kioskDevices } from "@/lib/db/schema";
import { withTenantTransaction } from "@/lib/db/with-tenant";
import { hashKioskToken } from "@/lib/kiosk/access";
import { generateKioskDeviceToken } from "@/lib/kiosk/session";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  name: z.string().min(1).max(255),
});

export async function GET() {
  const session = await getSession();
  if (!session || session.typ !== "tenant" || !session.tid) {
    return jsonError(401, "Não autenticado.");
  }
  if (session.role !== "tenant_admin") {
    return jsonError(403, "Apenas administrador da academia.");
  }

  const items = await withTenantTransaction(session.tid, async (tx) => {
    return tx
      .select({
        id: kioskDevices.id,
        name: kioskDevices.name,
        lastSeenAt: kioskDevices.lastSeenAt,
        expiresAt: kioskDevices.expiresAt,
        revokedAt: kioskDevices.revokedAt,
        createdAt: kioskDevices.createdAt,
      })
      .from(kioskDevices)
      .where(eq(kioskDevices.tenantId, session.tid!))
      .orderBy(desc(kioskDevices.createdAt));
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

  let body: z.infer<typeof createSchema>;
  try {
    body = createSchema.parse(await request.json());
  } catch {
    return jsonError(400, "Payload inválido.");
  }

  const token = generateKioskDeviceToken();
  const tokenHash = hashKioskToken(token);

  const device = await withTenantTransaction(session.tid, async (tx) => {
    const [row] = await tx
      .insert(kioskDevices)
      .values({
        tenantId: session.tid!,
        name: body.name,
        tokenHash,
      })
      .returning({
        id: kioskDevices.id,
        name: kioskDevices.name,
        createdAt: kioskDevices.createdAt,
      });
    return row!;
  });

  await logAudit({
    tenantId: session.tid,
    actorUserId: session.sub,
    action: "kiosk.device_created",
    entity: "kiosk_device",
    entityId: device.id,
    payload: { name: body.name },
  });

  return NextResponse.json(
    {
      device,
      deviceToken: token,
    },
    { status: 201 },
  );
}
