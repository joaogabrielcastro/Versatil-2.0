import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError } from "@/lib/api/json";
import { logAudit } from "@/lib/audit/log";
import { getSession } from "@/lib/auth/session";
import { renewTerm } from "@/lib/services/billing/subscription-actions";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string; subscriptionId: string }> },
) {
  const { id, subscriptionId } = await ctx.params;
  const session = await getSession();
  if (!session || session.typ !== "tenant" || !session.tid) {
    return jsonError(401, "Não autenticado.");
  }
  if (session.role !== "tenant_admin") {
    return jsonError(403, "Apenas administrador da academia.");
  }
  let body: { endsAt: string; planId?: string };
  try {
    body = z
      .object({ endsAt: z.string().min(1), planId: z.string().uuid().optional() })
      .parse(await request.json());
  } catch {
    return jsonError(400, "Informe a nova data de fim.");
  }
  const endsAt = new Date(body.endsAt);
  if (Number.isNaN(endsAt.getTime())) return jsonError(400, "Data inválida.");
  const result = await renewTerm({
    tenantId: session.tid,
    studentId: id,
    subscriptionId,
    actorUserId: session.sub,
    endsAt,
    planId: body.planId,
  });
  if (!result.ok) return jsonError(result.http, result.error);
  await logAudit({
    tenantId: session.tid,
    actorUserId: session.sub,
    action: "subscription.renewed",
    entity: "student_subscription",
    entityId: subscriptionId,
    payload: result.detail,
  });
  return NextResponse.json(result.detail);
}
