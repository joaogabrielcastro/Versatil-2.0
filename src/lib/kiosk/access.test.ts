import { describe, expect, it } from "vitest";
import {
  KIOSK_SEARCH_MAX_RESULTS,
  KIOSK_SEARCH_MIN_CHARS,
  isKioskDeviceUsable,
  sanitizeKioskSearchQuery,
} from "@/lib/kiosk/access";

describe("sanitizeKioskSearchQuery", () => {
  it("remove curingas ILIKE e corta tamanho", () => {
    expect(sanitizeKioskSearchQuery("  Jo%a_n\\o  ")).toBe("Joano");
    expect(sanitizeKioskSearchQuery("a".repeat(100)).length).toBe(80);
  });

  it("mantém acentos e espaços internos", () => {
    expect(sanitizeKioskSearchQuery("José Silva")).toBe("José Silva");
  });
});

describe("kiosk search constants", () => {
  it("exige mínimo de caracteres e limita resultados", () => {
    expect(KIOSK_SEARCH_MIN_CHARS).toBeGreaterThanOrEqual(2);
    expect(KIOSK_SEARCH_MAX_RESULTS).toBeLessThanOrEqual(50);
  });
});

describe("isKioskDeviceUsable", () => {
  const tenantA = "11111111-1111-1111-1111-111111111111";
  const tenantB = "22222222-2222-2222-2222-222222222222";
  const now = new Date("2026-09-13T12:00:00.000Z");

  it("aceita token válido da mesma academia", () => {
    expect(
      isKioskDeviceUsable(
        { tenantId: tenantA, revokedAt: null, expiresAt: null },
        tenantA,
        now,
      ),
    ).toBe("ok");
  });

  it("rejeita token de outra academia", () => {
    expect(
      isKioskDeviceUsable(
        { tenantId: tenantA, revokedAt: null, expiresAt: null },
        tenantB,
        now,
      ),
    ).toBe("cross_tenant");
  });

  it("rejeita token revogado", () => {
    expect(
      isKioskDeviceUsable(
        { tenantId: tenantA, revokedAt: now, expiresAt: null },
        tenantA,
        now,
      ),
    ).toBe("revoked");
  });

  it("rejeita token expirado", () => {
    expect(
      isKioskDeviceUsable(
        {
          tenantId: tenantA,
          revokedAt: null,
          expiresAt: new Date("2026-09-13T11:00:00.000Z"),
        },
        tenantA,
        now,
      ),
    ).toBe("expired");
  });
});
