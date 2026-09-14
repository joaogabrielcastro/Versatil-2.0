import { and, eq } from "drizzle-orm";
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

const patchSchema = z.object({
  action: z.enum(["revoke", "rotate"]),
});

async function requireAdmin() {
  const session = await getSession();
  if (!session || session.typ !== "tenant" || !session.tid) {
    return { error: jsonError(401, "Não autenticado.") as Response };
  }
  if (session.role !== "tenant_admin") {
    return { error: jsonError(403, "Apenas administrador da academia.") as Response };
  }
  return { session };
}

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const tenantId = auth.session.tid!;
  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) {
    return jsonError(400, "ID inválido.");
  }

  let body: z.infer<typeof patchSchema>;
  try {
    body = patchSchema.parse(await request.json());
  } catch {
    return jsonError(400, "Informe action: revoke ou rotate.");
  }

  if (body.action === "revoke") {
    const updated = await withTenantTransaction(tenantId, async (tx) => {
      const [row] = await tx
        .update(kioskDevices)
        .set({ revokedAt: new Date() })
        .where(
          and(eq(kioskDevices.id, id), eq(kioskDevices.tenantId, tenantId)),
        )
        .returning({ id: kioskDevices.id });
      return row ?? null;
    });
    if (!updated) return jsonError(404, "Terminal não encontrado.");
    await logAudit({
      tenantId,
      actorUserId: auth.session.sub,
      action: "kiosk.device_revoked",
      entity: "kiosk_device",
      entityId: id,
      payload: {},
    });
    return NextResponse.json({ ok: true, revoked: true });
  }

  const token = generateKioskDeviceToken();
  const tokenHash = hashKioskToken(token);
  const updated = await withTenantTransaction(tenantId, async (tx) => {
    const [row] = await tx
      .update(kioskDevices)
      .set({
        tokenHash,
        revokedAt: null,
      })
      .where(and(eq(kioskDevices.id, id), eq(kioskDevices.tenantId, tenantId)))
      .returning({
        id: kioskDevices.id,
        name: kioskDevices.name,
      });
    return row ?? null;
  });
  if (!updated) return jsonError(404, "Terminal não encontrado.");

  await logAudit({
    tenantId,
    actorUserId: auth.session.sub,
    action: "kiosk.device_token_rotated",
    entity: "kiosk_device",
    entityId: id,
    payload: {},
  });

  return NextResponse.json({
    ok: true,
    device: updated,
    deviceToken: token,
  });
}
