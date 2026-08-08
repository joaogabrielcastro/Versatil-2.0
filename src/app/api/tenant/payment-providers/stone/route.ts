import { NextResponse } from "next/server";
import { z } from "zod";
import { logAudit } from "@/lib/audit/log";
import { jsonError } from "@/lib/api/json";
import { getSession } from "@/lib/auth/session";
import {
  getProviderConfig,
  upsertProviderConfig,
  type StoneConnectCredentials,
} from "@/lib/payments/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const putSchema = z.object({
  enabled: z.boolean().optional(),
  secretKey: z.string().min(1).max(255).optional(),
  serviceRefererName: z.string().min(1).max(255).optional(),
  defaultTerminalSerial: z.string().max(64).optional(),
  paymentType: z.enum(["credit", "debit"]).optional(),
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

  const cfg = await getProviderConfig<StoneConnectCredentials>(
    tenantId,
    "stone_connect",
  );
  return NextResponse.json({
    configured: Boolean(cfg),
    enabled: cfg?.enabled ?? false,
    hasSecretKey: Boolean(cfg?.credentials.secretKey),
    serviceRefererName: cfg?.credentials.serviceRefererName ?? null,
    defaultTerminalSerial: cfg?.credentials.defaultTerminalSerial ?? null,
    paymentType: cfg?.credentials.paymentType ?? "credit",
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

  const credentials: Partial<StoneConnectCredentials> = {};
  if (body.secretKey) credentials.secretKey = body.secretKey.trim();
  if (body.serviceRefererName) {
    credentials.serviceRefererName = body.serviceRefererName.trim();
  }
  if (body.defaultTerminalSerial !== undefined) {
    credentials.defaultTerminalSerial = body.defaultTerminalSerial.trim();
  }
  if (body.paymentType) credentials.paymentType = body.paymentType;

  await upsertProviderConfig(tenantId, "stone_connect", {
    enabled: body.enabled,
    credentials,
  });

  await logAudit({
    tenantId,
    actorUserId: auth.session.sub,
    action: "tenant.stone_settings_updated",
    entity: "payment_provider_configs",
    entityId: tenantId,
    payload: {
      enabled: body.enabled ?? null,
      secretKeyChanged: Boolean(body.secretKey),
    },
  });

  return NextResponse.json({ ok: true });
}
