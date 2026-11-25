import { describe, expect, it } from "vitest";
import {
  cpfsEqual,
  cpfRejectionMessage,
  isValidCpf,
  normalizeCpf,
  parseCpfInput,
} from "@/lib/cpf";

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
    expect(cpfRejectionMessage("123")).toBe("Informe um CPF com 11 dígitos");
    expect(cpfRejectionMessage("529.982.247-25")).toBeNull();
    expect(cpfRejectionMessage(null)).toBe("Informe um CPF válido");
  });

  it("valida dígitos verificadores no cadastro", () => {
    expect(isValidCpf("52998224725")).toBe(true);
    expect(isValidCpf("11144477735")).toBe(true);
    expect(isValidCpf("52998224724")).toBe(false);
    expect(isValidCpf("11111111111")).toBe(false);
    expect(isValidCpf("00000000000")).toBe(false);
    expect(cpfRejectionMessage("111.111.111-11")).toBe("Informe um CPF válido");
    expect(cpfRejectionMessage("529.982.247-24")).toBe("Informe um CPF válido");
  });
});
