import { createHash } from "crypto";
import { and, eq, isNull } from "drizzle-orm";
import { jsonError } from "@/lib/api/json";
import { getSession } from "@/lib/auth/session";
import { getEnv } from "@/lib/env";
import { kioskDevices } from "@/lib/db/schema";
import { withBypassRlsTransaction, withTenantTransaction } from "@/lib/db/with-tenant";
import {
  KIOSK_COOKIE_NAME,
  readCookieValue,
  verifyKioskSession,
} from "@/lib/kiosk/session";

function readProvidedToken(request: Request): string {
  return request.headers.get("x-kiosk-token")?.trim() ?? "";
}

export function hashKioskToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function isKioskDeviceUsable(device: {
  tenantId: string;
  revokedAt: Date | null;
  expiresAt: Date | null;
}, tenantId: string, now = new Date()): "ok" | "cross_tenant" | "revoked" | "expired" {
  if (device.tenantId !== tenantId) return "cross_tenant";
  if (device.revokedAt) return "revoked";
  if (device.expiresAt && device.expiresAt.getTime() <= now.getTime()) return "expired";
  return "ok";
}

/**
 * Autoriza o terminal: sessão da mesma academia OU token de dispositivo
 * cadastrado para aquele tenant. Nunca aceita secret global.
 */
export async function assertKioskAccess(
  request: Request,
  tenantId: string,
): Promise<Response | null> {
  const session = await getSession();
  if (session?.typ === "tenant" && session.tid === tenantId) {
    return null;
  }

  const cookieToken = readCookieValue(
    request.headers.get("cookie"),
    KIOSK_COOKIE_NAME,
  );
  if (cookieToken) {
    try {
      const kiosk = await verifyKioskSession(cookieToken, getEnv().JWT_SECRET);
      if (kiosk.tid !== tenantId) {
        return jsonError(403, "Token do terminal não pertence a esta academia.");
      }
      const deviceRow = await withBypassRlsTransaction(async (tx) => {
        const [row] = await tx
          .select({
            tenantId: kioskDevices.tenantId,
            revokedAt: kioskDevices.revokedAt,
            expiresAt: kioskDevices.expiresAt,
          })
          .from(kioskDevices)
          .where(
            and(
              eq(kioskDevices.id, kiosk.deviceId),
              eq(kioskDevices.tenantId, kiosk.tid),
            ),
          )
          .limit(1);
        return row ?? null;
      });
      const usable = deviceRow
        ? isKioskDeviceUsable(deviceRow, tenantId)
        : "revoked";
      if (usable === "ok") {
        await withTenantTransaction(kiosk.tid, async (tx) => {
          await tx
            .update(kioskDevices)
            .set({ lastSeenAt: new Date() })
            .where(
              and(
                eq(kioskDevices.id, kiosk.deviceId),
                eq(kioskDevices.tenantId, kiosk.tid),
              ),
            );
        });
        return null;
      }
      if (usable === "cross_tenant") {
        return jsonError(403, "Token do terminal não pertence a esta academia.");
      }
    } catch {
      /* cookie inválido: tenta header x-kiosk-token */
    }
  }

  const provided = readProvidedToken(request);
  if (!provided) {
    return jsonError(
      401,
      "Token do terminal inválido ou ausente. Cadastre um dispositivo em Integrações.",
    );
  }

  const tokenHash = hashKioskToken(provided);
  const device = await withBypassRlsTransaction(async (tx) => {
    const [row] = await tx
      .select({
        id: kioskDevices.id,
        tenantId: kioskDevices.tenantId,
        revokedAt: kioskDevices.revokedAt,
        expiresAt: kioskDevices.expiresAt,
      })
      .from(kioskDevices)
      .where(and(eq(kioskDevices.tokenHash, tokenHash), isNull(kioskDevices.revokedAt)))
      .limit(1);
    return row ?? null;
  });

  if (!device) {
    return jsonError(401, "Token do terminal inválido ou ausente.");
  }

  const usable = isKioskDeviceUsable(device, tenantId);
  if (usable === "cross_tenant") {
    return jsonError(403, "Token do terminal não pertence a esta academia.");
  }
  if (usable === "revoked") {
    return jsonError(401, "Token do terminal foi revogado.");
  }
  if (usable === "expired") {
    return jsonError(401, "Token do terminal expirado.");
  }

  await withTenantTransaction(device.tenantId, async (tx) => {
    await tx
      .update(kioskDevices)
      .set({ lastSeenAt: new Date() })
      .where(
        and(eq(kioskDevices.id, device.id), eq(kioskDevices.tenantId, device.tenantId)),
      );
  });

  return null;
}

export function sanitizeKioskSearchQuery(raw: string): string {
  return raw.trim().replace(/[%_\\]/g, "").slice(0, 80);
}

export const KIOSK_SEARCH_MIN_CHARS = 2;
export const KIOSK_SEARCH_MAX_RESULTS = 20;
