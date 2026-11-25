import { createHash, randomBytes } from "crypto";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { logAudit } from "@/lib/audit/log";
import { jsonError } from "@/lib/api/json";
import { isSessionError, requireTenantAdmin } from "@/lib/auth/guards";
import { turnstileDevices } from "@/lib/db/schema";
import { withTenantTransaction } from "@/lib/db/with-tenant";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  action: z.enum(["revoke", "rotate"]),
});

/**
 * revoke: o token deixa de abrir a catraca imediatamente (equipamento perdido,
 * gateway comprometido, troca de fornecedor). rotate: gera token novo e reativa.
 * O histórico em access_events é preservado nos dois casos.
 */
export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await requireTenantAdmin();
  if (isSessionError(session)) return session;
  const tenantId = session.tid;

  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) {
    return jsonError(400, "ID inválido.");
  }
  const parsed = patchSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return jsonError(400, "Informe action: revoke ou rotate.");
  }
  const { action } = parsed.data;

  const token = action === "rotate" ? randomBytes(32).toString("hex") : null;
  const updated = await withTenantTransaction(tenantId, async (tx) => {
    const [row] = await tx
      .update(turnstileDevices)
      .set(
        token
          ? {
              tokenHash: createHash("sha256").update(token, "utf8").digest("hex"),
              revokedAt: null,
            }
          : { revokedAt: new Date() },
      )
      .where(and(eq(turnstileDevices.id, id), eq(turnstileDevices.tenantId, tenantId)))
      .returning({ id: turnstileDevices.id, name: turnstileDevices.name });
    return row ?? null;
  });
  if (!updated) return jsonError(404, "Dispositivo não encontrado.");

  await logAudit({
    tenantId,
    actorUserId: session.sub,
    action: action === "rotate" ? "turnstile.device_rotated" : "turnstile.device_revoked",
    entity: "turnstile_device",
    entityId: id,
    payload: {},
  });

  if (token) {
    /** Mostrado uma única vez — configure no equipamento/gateway. */
    return NextResponse.json({ ok: true, device: updated, deviceToken: token });
  }
  return NextResponse.json({ ok: true, revoked: true });
}
