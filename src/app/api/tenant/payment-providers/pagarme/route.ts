import { NextResponse } from "next/server";
import { z } from "zod";
import { logAudit } from "@/lib/audit/log";
import { jsonError } from "@/lib/api/json";
import { getSession } from "@/lib/auth/session";
import {
  getProviderConfig,
  upsertProviderConfig,
  type PagarmeCredentials,
} from "@/lib/payments/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const putSchema = z.object({
  enabled: z.boolean().optional(),
  secretKey: z.string().min(1).max(255).optional(),
  publicKey: z.string().max(255).optional(),
  webhookSecret: z.string().max(255).optional(),
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

export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const tenantId = auth.session.tid!;

  const cfg = await getProviderConfig<PagarmeCredentials>(tenantId, "pagarme");
  return NextResponse.json({
    configured: Boolean(cfg),
    enabled: cfg?.enabled ?? false,
    hasSecretKey: Boolean(cfg?.credentials.secretKey),
    hasWebhookSecret: Boolean(cfg?.credentials.webhookSecret),
    publicKey: cfg?.credentials.publicKey ?? null,
    updatedAt: cfg?.updatedAt ?? null,
  });
}

export async function PUT(request: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const tenantId = auth.session.tid!;

  let body: z.infer<typeof putSchema>;
  try {
    body = putSchema.parse(await request.json());
  } catch {
    return jsonError(400, "Payload inválido.");
  }

  const credentials: Partial<PagarmeCredentials> = {};
  if (body.secretKey) credentials.secretKey = body.secretKey.trim();
  if (body.publicKey !== undefined) credentials.publicKey = body.publicKey.trim();
  if (body.webhookSecret) credentials.webhookSecret = body.webhookSecret.trim();

  await upsertProviderConfig(tenantId, "pagarme", {
    enabled: body.enabled,
    credentials,
  });

  await logAudit({
    tenantId,
    actorUserId: auth.session.sub,
    action: "tenant.pagarme_settings_updated",
    entity: "payment_provider_configs",
    entityId: tenantId,
    payload: {
      enabled: body.enabled ?? null,
      secretKeyChanged: Boolean(body.secretKey),
      webhookSecretChanged: Boolean(body.webhookSecret),
    },
  });

  return NextResponse.json({ ok: true });
}
