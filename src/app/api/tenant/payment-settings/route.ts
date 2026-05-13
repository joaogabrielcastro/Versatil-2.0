import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError } from "@/lib/api/json";
import { getSession } from "@/lib/auth/session";
import { tenantPaymentSettings } from "@/lib/db/schema";
import { withTenantTransaction } from "@/lib/db/with-tenant";
import { decryptJson, encryptJson, getPaymentSecretKey } from "@/lib/crypto/payment-secret";
import { getEnv } from "@/lib/env";
import { logAudit } from "@/lib/audit/log";

export const dynamic = "force-dynamic";

type TenantCreds = {
  stripeSecretKey?: string;
  stripeWebhookSecret?: string;
  asaasApiKey?: string;
};

const putSchema = z.object({
  gateway: z.enum(["stripe", "asaas"]),
  stripeSecretKey: z.string().optional(),
  stripeWebhookSecret: z.string().optional(),
  asaasApiKey: z.string().optional(),
});

export async function GET() {
  const session = await getSession();
  if (!session || session.typ !== "tenant" || !session.tid) {
    return jsonError(401, "Não autenticado.");
  }
  if (session.role !== "tenant_admin") {
    return jsonError(403, "Apenas administrador da academia.");
  }
  const tenantId = session.tid;

  const row = await withTenantTransaction(tenantId, async (tx) => {
    const [r] = await tx
      .select()
      .from(tenantPaymentSettings)
      .where(eq(tenantPaymentSettings.tenantId, tenantId))
      .limit(1);
    return r ?? null;
  });

  if (!row) {
    return NextResponse.json({
      configured: false,
      gateway: null,
      hasStripeSecret: false,
      hasAsaasKey: false,
    });
  }

  let hasStripeSecret = false;
  let hasAsaasKey = false;
  try {
    const key = getPaymentSecretKey(getEnv());
    const creds = decryptJson<TenantCreds>(
      row.encryptedCredentials,
      key,
    );
    hasStripeSecret = Boolean(creds.stripeSecretKey?.length);
    hasAsaasKey = Boolean(creds.asaasApiKey?.length);
  } catch {
    /* ignore */
  }

  return NextResponse.json({
    configured: true,
    gateway: row.gateway,
    hasStripeSecret,
    hasAsaasKey,
    updatedAt: row.updatedAt,
  });
}

export async function PUT(request: Request) {
  const session = await getSession();
  if (!session || session.typ !== "tenant" || !session.tid) {
    return jsonError(401, "Não autenticado.");
  }
  if (session.role !== "tenant_admin") {
    return jsonError(403, "Apenas administrador da academia.");
  }
  const tenantId = session.tid;

  let body: z.infer<typeof putSchema>;
  try {
    body = putSchema.parse(await request.json());
  } catch {
    return jsonError(400, "Payload inválido.");
  }

  const key = getPaymentSecretKey(getEnv());

  await withTenantTransaction(tenantId, async (tx) => {
    const [existing] = await tx
      .select()
      .from(tenantPaymentSettings)
      .where(eq(tenantPaymentSettings.tenantId, tenantId))
      .limit(1);

    let merged: TenantCreds = {};
    if (existing) {
      try {
        merged = decryptJson(existing.encryptedCredentials, key);
      } catch {
        merged = {};
      }
    }

    if (body.stripeSecretKey) merged.stripeSecretKey = body.stripeSecretKey;
    if (body.stripeWebhookSecret) {
      merged.stripeWebhookSecret = body.stripeWebhookSecret;
    }
    if (body.asaasApiKey) merged.asaasApiKey = body.asaasApiKey;

    const blob = encryptJson(merged, key);
    const now = new Date();

    if (existing) {
      await tx
        .update(tenantPaymentSettings)
        .set({
          gateway: body.gateway,
          encryptedCredentials: blob,
          updatedAt: now,
        })
        .where(eq(tenantPaymentSettings.tenantId, tenantId));
    } else {
      await tx.insert(tenantPaymentSettings).values({
        tenantId,
        gateway: body.gateway,
        encryptedCredentials: blob,
        updatedAt: now,
      });
    }
  });

  await logAudit({
    tenantId,
    actorUserId: session.sub,
    action: "tenant.payment_settings_updated",
    entity: "tenant_payment_settings",
    entityId: tenantId,
    payload: { gateway: body.gateway },
  });

  return NextResponse.json({ ok: true });
}
