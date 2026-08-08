import { timingSafeEqual } from "crypto";
import { jsonError } from "@/lib/api/json";
import { getSession } from "@/lib/auth/session";
import { getEnv } from "@/lib/env";

function readProvidedToken(request: Request): string {
  const header = request.headers.get("x-kiosk-token")?.trim() ?? "";
  if (header) return header;
  const url = new URL(request.url);
  return (
    url.searchParams.get("kioskToken")?.trim() ||
    url.searchParams.get("token")?.trim() ||
    ""
  );
}

function secretsEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/**
 * Autoriza acesso às APIs do terminal de treino.
 * Aceita: token (`KIOSK_ACCESS_SECRET`) ou sessão tenant do mesmo tenant.
 * Em produção sem secret configurado → 503.
 * @returns `null` se autorizado; Response de erro caso contrário.
 */
export async function assertKioskAccess(
  request: Request,
  tenantId: string,
): Promise<Response | null> {
  const env = getEnv();
  const secret = env.KIOSK_ACCESS_SECRET;
  const provided = readProvidedToken(request);

  if (secret && provided && secretsEqual(secret, provided)) {
    return null;
  }

  const session = await getSession();
  if (session?.typ === "tenant" && session.tid === tenantId) {
    return null;
  }

  if (secret) {
    return jsonError(
      401,
      "Token do terminal inválido ou ausente. Use o link com ?token=… ou abra a partir do balcão.",
    );
  }

  if (env.NODE_ENV === "production") {
    return jsonError(
      503,
      "KIOSK_ACCESS_SECRET não configurado no ambiente.",
    );
  }

  return null;
}

/** Remove curingas ILIKE e limita tamanho. */
export function sanitizeKioskSearchQuery(raw: string): string {
  return raw.trim().replace(/[%_\\]/g, "").slice(0, 80);
}

export const KIOSK_SEARCH_MIN_CHARS = 2;
export const KIOSK_SEARCH_MAX_RESULTS = 20;
