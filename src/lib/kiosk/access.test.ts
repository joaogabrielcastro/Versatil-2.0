import { describe, expect, it } from "vitest";
import {
  KIOSK_SEARCH_MAX_RESULTS,
  KIOSK_SEARCH_MIN_CHARS,
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
