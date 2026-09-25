import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError } from "@/lib/api/json";
import { logAudit } from "@/lib/audit/log";
import { getSession } from "@/lib/auth/session";
import { cancelSubscription } from "@/lib/services/billing/subscription-actions";

export const dynamic = "force-dynamic";

async function admin(studentId: string) {
  const session = await getSession();
  if (!session || session.typ !== "tenant" || !session.tid) {
    return { error: jsonError(401, "Não autenticado.") };
  }
  if (session.role !== "tenant_admin") {
    return { error: jsonError(403, "Apenas administrador da academia.") };
  }
  if (!z.string().uuid().safeParse(studentId).success) {
    return { error: jsonError(400, "ID inválido.") };
  }
  return { session };
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string; subscriptionId: string }> },
) {
  const { id, subscriptionId } = await ctx.params;
  const auth = await admin(id);
  if ("error" in auth && auth.error) return auth.error;
  if (!z.string().uuid().safeParse(subscriptionId).success) {
    return jsonError(400, "Assinatura inválida.");
  }
  let reason = "";
  try {
    const body = z.object({ reason: z.string().min(3).max(500) }).parse(await request.json());
    reason = body.reason;
  } catch {
    return jsonError(400, "Informe o motivo do cancelamento.");
  }
  const result = await cancelSubscription({
    tenantId: auth.session!.tid!,
    studentId: id,
    subscriptionId,
    actorUserId: auth.session!.sub,
    reason,
  });
  if (!result.ok) return jsonError(result.http, result.error);
  await logAudit({
    tenantId: auth.session!.tid!,
    actorUserId: auth.session!.sub,
    action: "subscription.canceled",
    entity: "student_subscription",
    entityId: subscriptionId,
    payload: { reason, ...result.detail },
  });
  return NextResponse.json(result.detail);
}
