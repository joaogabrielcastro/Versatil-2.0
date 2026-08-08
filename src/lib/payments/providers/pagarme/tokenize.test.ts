import { describe, expect, it } from "vitest";
import {
  buildCardTokenPayload,
  extractTokenId,
  pagarmeTokensUrl,
  parseExpiry,
  validateCardInput,
} from "@/lib/payments/providers/pagarme/tokenize";

describe("pagarmeTokensUrl", () => {
  it("inclui appId com a chave pública", () => {
    expect(pagarmeTokensUrl("pk_test_abc")).toBe(
      "https://api.pagar.me/core/v5/tokens?appId=pk_test_abc",
    );
  });
});

describe("parseExpiry", () => {
  it("aceita MM/AA e converte ano", () => {
    expect(parseExpiry("12/30")).toEqual({ expMonth: 12, expYear: 2030 });
  });
  it("aceita MM/AAAA", () => {
    expect(parseExpiry("03/2027")).toEqual({ expMonth: 3, expYear: 2027 });
  });
  it("rejeita mês/formatos inválidos", () => {
    expect(parseExpiry("13/30")).toBeNull();
    expect(parseExpiry("1/30")).toBeNull();
    expect(parseExpiry("abc")).toBeNull();
  });
});

describe("buildCardTokenPayload", () => {
  it("monta payload com dígitos e nomes esperados", () => {
    const p = buildCardTokenPayload({
      number: "4111 1111 1111 1111",
      holderName: "  João Silva ",
      expMonth: 12,
      expYear: 2030,
      cvv: "123",
    });
    expect(p).toEqual({
      type: "card",
      card: {
        number: "4111111111111111",
        holder_name: "João Silva",
        exp_month: 12,
        exp_year: 2030,
        cvv: "123",
      },
    });
  });
});

describe("extractTokenId", () => {
  it("retorna id quando é token_", () => {
    expect(extractTokenId({ id: "token_abc" })).toBe("token_abc");
  });
  it("retorna null caso contrário", () => {
    expect(extractTokenId({ id: "card_abc" })).toBeNull();
    expect(extractTokenId({})).toBeNull();
    expect(extractTokenId(null)).toBeNull();
  });
});

describe("validateCardInput", () => {
  const ok = {
    number: "4111111111111111",
    holderName: "João",
    expMonth: 12,
    expYear: 2030,
    cvv: "123",
  };
  it("aceita cartão válido", () => {
    expect(validateCardInput(ok)).toBeNull();
  });
  it("rejeita número curto", () => {
    expect(validateCardInput({ ...ok, number: "411" })).toMatch(/Número/);
  });
  it("rejeita cvv inválido", () => {
    expect(validateCardInput({ ...ok, cvv: "1" })).toMatch(/CVV/);
  });
  it("rejeita titular vazio", () => {
    expect(validateCardInput({ ...ok, holderName: "" })).toMatch(/titular/);
  });
});
