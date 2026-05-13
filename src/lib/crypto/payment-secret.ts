import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";
import type { Env } from "@/lib/env";

const ALGO = "aes-256-gcm";

export function getPaymentSecretKey(env: Env): Buffer {
  if (env.PAYMENT_ENCRYPTION_KEY) {
    return Buffer.from(env.PAYMENT_ENCRYPTION_KEY, "hex");
  }
  return scryptSync(env.JWT_SECRET, "tecnofit-payment-v1", 32);
}

export function encryptJson(obj: unknown, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([
    cipher.update(JSON.stringify(obj), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64url");
}

export function decryptJson<T>(blob: string, key: Buffer): T {
  const buf = Buffer.from(blob, "base64url");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const data = buf.subarray(28);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(data), decipher.final()]);
  return JSON.parse(dec.toString("utf8")) as T;
}
