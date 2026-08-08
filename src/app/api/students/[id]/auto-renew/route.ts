import { NextResponse } from "next/server";
import { z } from "zod";
import { logAudit } from "@/lib/audit/log";
import { jsonError } from "@/lib/api/json";
import { getSession } from "@/lib/auth/session";
import {
  getAutoRenewStatus,
  saveSubscriptionCard,
  setAutoRenew,
} from "@/lib/services/billing/recurring-charge";
import { PaymentProviderError } from "@/lib/payments/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const putSchema = z
  .object({
    autoRenew: z.boolean().optional(),
    cardToken: z.string().min(1).max(255).optional(),
  })
  .refine((v) => v.autoRenew !== undefined || v.cardToken, {
    message: "Informe cardToken ou autoRenew.",
  });

async function requireAdmin(id: string) {
  const session = await getSession();
  if (!session || session.typ !== "tenant" || !session.tid) {
    return { error: jsonError(401, "Não autenticado.") as Response };
  }
  if (session.role !== "tenant_admin") {
    return { error: jsonError(403, "Apenas administrador da academia.") as Response };
  }
  if (!z.string().uuid().safeParse(id).success) {
    return { error: jsonError(400, "ID inválido.") as Response };
  }
  return { session };
}

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const auth = await requireAdmin(id);
  if ("error" in auth) return auth.error;
  const status = await getAutoRenewStatus(auth.session.tid!, id);
  return NextResponse.json(status);
}

export async function PUT(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const auth = await requireAdmin(id);
  if ("error" in auth) return auth.error;
  const tenantId = auth.session.tid!;

  let body: z.infer<typeof putSchema>;
  try {
    body = putSchema.parse(await request.json());
  } catch {
    return jsonError(400, "Payload inválido.");
  }

  try {
    if (body.cardToken) {
      const r = await saveSubscriptionCard(tenantId, id, body.cardToken);
      if (!r.ok) return jsonError(400, r.reason ?? "Falha ao salvar cartão.");
    }
    if (body.autoRenew !== undefined) {
      const r = await setAutoRenew(tenantId, id, body.autoRenew);
      if (!r.ok) return jsonError(400, r.reason ?? "Falha ao alterar renovação.");
    }
  } catch (e) {
    if (e instanceof PaymentProviderError) return jsonError(502, e.message);
    throw e;
  }

  await logAudit({
    tenantId,
    actorUserId: auth.session.sub,
    action: "billing.auto_renew_updated",
    entity: "student",
    entityId: id,
    payload: {
      autoRenew: body.autoRenew ?? null,
      cardSaved: Boolean(body.cardToken),
    },
  });

  const status = await getAutoRenewStatus(tenantId, id);
  return NextResponse.json(status);
}
