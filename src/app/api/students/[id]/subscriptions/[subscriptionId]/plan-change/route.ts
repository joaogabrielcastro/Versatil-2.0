import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError } from "@/lib/api/json";
import { logAudit } from "@/lib/audit/log";
import { getSession } from "@/lib/auth/session";
import {
  clearScheduledPlanChange,
  schedulePlanChange,
} from "@/lib/services/billing/subscription-actions";

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
  let planId = "";
  try {
    planId = z.object({ planId: z.string().uuid() }).parse(await request.json()).planId;
  } catch {
    return jsonError(400, "Informe o plano.");
  }
  const result = await schedulePlanChange({
    tenantId: auth.session!.tid!,
    studentId: id,
    subscriptionId,
    planId,
  });
  if (!result.ok) return jsonError(result.http, result.error);
  await logAudit({
    tenantId: auth.session!.tid!,
    actorUserId: auth.session!.sub,
    action: "subscription.plan_change_scheduled",
    entity: "student_subscription",
    entityId: subscriptionId,
    payload: { planId, ...result.detail },
  });
  return NextResponse.json(result.detail);
}

export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ id: string; subscriptionId: string }> },
) {
  const { id, subscriptionId } = await ctx.params;
  const auth = await admin(id);
  if ("error" in auth && auth.error) return auth.error;
  const result = await clearScheduledPlanChange({
    tenantId: auth.session!.tid!,
    studentId: id,
    subscriptionId,
  });
  if (!result.ok) return jsonError(result.http, result.error);
  await logAudit({
    tenantId: auth.session!.tid!,
    actorUserId: auth.session!.sub,
    action: "subscription.plan_change_cleared",
    entity: "student_subscription",
    entityId: subscriptionId,
    payload: result.detail,
  });
  return NextResponse.json(result.detail);
}
