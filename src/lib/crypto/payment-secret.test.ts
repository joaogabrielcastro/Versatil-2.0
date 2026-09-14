import { describe, expect, it } from "vitest";
import { getPaymentSecretKey } from "@/lib/crypto/payment-secret";
import type { Env } from "@/lib/env";

const jwt = "01234567890123456789012345678901";

describe("getPaymentSecretKey", () => {
  it("exige PAYMENT_ENCRYPTION_KEY em produção", () => {
    expect(() =>
      getPaymentSecretKey({
        NODE_ENV: "production",
        JWT_SECRET: jwt,
      } as Env),
    ).toThrow(/PAYMENT_ENCRYPTION_KEY/);
  });

  it("usa a chave hex quando presente", () => {
    const key = "ab".repeat(32);
    const buf = getPaymentSecretKey({
      NODE_ENV: "production",
      JWT_SECRET: jwt,
      PAYMENT_ENCRYPTION_KEY: key,
    } as Env);
    expect(buf.equals(Buffer.from(key, "hex"))).toBe(true);
  });
});
