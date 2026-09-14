import { describe, expect, it } from "vitest";
import { cpfsEqual, normalizeCpf, parseCpfInput } from "@/lib/cpf";

describe("CPF", () => {
  it("normaliza máscara para dígitos", () => {
    expect(normalizeCpf("123.456.789-00")).toBe("12345678900");
    expect(parseCpfInput("123.456.789-00")).toBe("12345678900");
  });

  it("compara mascarado com não mascarado", () => {
    expect(cpfsEqual("123.456.789-00", "12345678900")).toBe(true);
    expect(cpfsEqual("123.456.789-00", "00000000000")).toBe(false);
  });

  it("rejeita CPF incompleto", () => {
    expect(parseCpfInput("123.456")).toBeNull();
  });
});
