import { describe, expect, it } from "vitest";
import { clientIp } from "@/lib/http/client-ip";

describe("clientIp", () => {
  it("ignora X-Forwarded-For mesmo se alguém pedir esse cabeçalho", () => {
    const headers = new Headers({
      "x-forwarded-for": "1.1.1.1, 10.0.0.8",
      "x-real-ip": "10.0.0.8",
    });
    expect(clientIp(headers, undefined)).toBe("direct");
    expect(clientIp(headers, "x-forwarded-for")).toBe("direct");
  });

  it("aceita um cabeçalho único que o proxy substitui", () => {
    const headers = new Headers({ "cf-connecting-ip": "203.0.113.10" });
    expect(clientIp(headers, "cf-connecting-ip")).toBe("203.0.113.10");
  });
});
