import { createHash, randomBytes } from "crypto";
import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { logAudit } from "@/lib/audit/log";
import { jsonError } from "@/lib/api/json";
import { getSession } from "@/lib/auth/session";
import { turnstileDevices } from "@/lib/db/schema";
import { withTenantTransaction } from "@/lib/db/with-tenant";

export const dynamic = "force-dynamic";

function hashToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

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
        id: turnstileDevices.id,
        name: turnstileDevices.name,
        lastSeenAt: turnstileDevices.lastSeenAt,
        createdAt: turnstileDevices.createdAt,
      })
      .from(turnstileDevices)
      .where(eq(turnstileDevices.tenantId, session.tid!))
      .orderBy(desc(turnstileDevices.createdAt));
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

  const token = randomBytes(32).toString("hex");
  const tokenHash = hashToken(token);

  const device = await withTenantTransaction(session.tid, async (tx) => {
    const [row] = await tx
      .insert(turnstileDevices)
      .values({
        tenantId: session.tid!,
        name: body.name,
        tokenHash,
      })
      .returning({
        id: turnstileDevices.id,
        name: turnstileDevices.name,
        createdAt: turnstileDevices.createdAt,
      });
    return row!;
  });

  await logAudit({
    tenantId: session.tid,
    actorUserId: session.sub,
    action: "turnstile.device_created",
    entity: "turnstile_device",
    entityId: device.id,
    payload: { name: body.name },
  });

  return NextResponse.json(
    {
      device,
      /** Mostrado uma única vez — guarde no equipamento/gateway da catraca. */
      deviceToken: token,
    },
    { status: 201 },
  );
}
