import { randomBytes } from "crypto";
import { SignJWT, jwtVerify } from "jose";
import { JWT_AUDIENCE, JWT_ISSUER } from "@/lib/auth/constants";

export const KIOSK_COOKIE_NAME = "tf_kiosk";

export type KioskSessionPayload = {
  deviceId: string;
  tid: string;
};

function secretKey(secret: string) {
  return new TextEncoder().encode(secret);
}

export async function signKioskSession(
  payload: KioskSessionPayload,
  secret: string,
): Promise<string> {
  return new SignJWT({
    typ: "kiosk",
    tid: payload.tid,
    deviceId: payload.deviceId,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.deviceId)
    .setIssuedAt()
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setExpirationTime("30d")
    .sign(secretKey(secret));
}

export async function verifyKioskSession(
  token: string,
  secret: string,
): Promise<KioskSessionPayload> {
  const { payload } = await jwtVerify(token, secretKey(secret), {
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  });
  if (payload.typ !== "kiosk") {
    throw new Error("not_kiosk");
  }
  const tid = typeof payload.tid === "string" ? payload.tid : "";
  const deviceId =
    typeof payload.deviceId === "string"
      ? payload.deviceId
      : typeof payload.sub === "string"
        ? payload.sub
        : "";
  if (!tid || !deviceId) throw new Error("invalid_kiosk_session");
  return { tid, deviceId };
}

export function readCookieValue(
  cookieHeader: string | null,
  name: string,
): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [rawKey, ...rest] = part.trim().split("=");
    if (rawKey === name) {
      return decodeURIComponent(rest.join("="));
    }
  }
  return null;
}

export function generateKioskDeviceToken(): string {
  return randomBytes(32).toString("hex");
}
