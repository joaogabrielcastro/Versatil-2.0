import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError } from "@/lib/api/json";
import { getEnv } from "@/lib/env";
import { assertKioskAccess, hashKioskToken } from "@/lib/kiosk/access";
import { resolveKioskTenantId } from "@/lib/kiosk/resolve-tenant";
import {
  KIOSK_COOKIE_NAME,
  signKioskSession,
} from "@/lib/kiosk/session";
import { kioskDevices } from "@/lib/db/schema";
import { withBypassRlsTransaction } from "@/lib/db/with-tenant";
import { and, eq, isNull } from "drizzle-orm";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  tenantSlug: z.string().min(2).max(64),
  token: z.string().min(16).max(128),
});

export async function POST(request: Request) {
  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return jsonError(400, "Informe tenantSlug e token do terminal.");
  }

  const resolved = await resolveKioskTenantId(body.tenantSlug);
  if (!resolved) {
    return jsonError(404, "Academia não encontrada.");
  }

  const probe = new Request(request.url, {
    headers: { "x-kiosk-token": body.token },
  });
  const denied = await assertKioskAccess(probe, resolved.tenantId);
  if (denied) return denied;

  const tokenHash = hashKioskToken(body.token);
  const device = await withBypassRlsTransaction(async (tx) => {
    const [row] = await tx
      .select({ id: kioskDevices.id })
      .from(kioskDevices)
      .where(
        and(
          eq(kioskDevices.tokenHash, tokenHash),
          eq(kioskDevices.tenantId, resolved.tenantId),
          isNull(kioskDevices.revokedAt),
        ),
      )
      .limit(1);
    return row ?? null;
  });
  if (!device) {
    return jsonError(401, "Token do terminal inválido ou ausente.");
  }

  const jwt = await signKioskSession(
    { deviceId: device.id, tid: resolved.tenantId },
    getEnv().JWT_SECRET,
  );

  const res = NextResponse.json({
    ok: true,
    tenantSlug: resolved.slug,
  });
  res.cookies.set(KIOSK_COOKIE_NAME, jwt, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
