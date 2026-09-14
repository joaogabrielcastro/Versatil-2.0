import { describe, expect, it } from "vitest";
import {
  STONE_CONNECT_API_BASE,
  buildStoneConnectAuthHeader,
  mapStoneConnectChargeStatus,
} from "@/lib/payments/providers/stone/http";

describe("StoneConnectHttpClient helpers", () => {
  it("usa o host Core v5 documentado no Connect (não inventa API)", () => {
    expect(STONE_CONNECT_API_BASE).toBe("https://api.pagar.me/core/v5");
  });

  it("monta Basic Auth com secret key e senha vazia", () => {
    expect(buildStoneConnectAuthHeader("sk_test_abc")).toBe(
      `Basic ${Buffer.from("sk_test_abc:").toString("base64")}`,
    );
  });

  it("mapeia status de cobrança do POS", () => {
    expect(mapStoneConnectChargeStatus("paid")).toBe("paid");
    expect(mapStoneConnectChargeStatus("captured")).toBe("paid");
    expect(mapStoneConnectChargeStatus("failed")).toBe("failed");
    expect(mapStoneConnectChargeStatus("not_authorized")).toBe("failed");
    expect(mapStoneConnectChargeStatus("canceled")).toBe("failed");
    expect(mapStoneConnectChargeStatus("with_error")).toBe("failed");
    expect(mapStoneConnectChargeStatus("pending")).toBe("pending");
    expect(mapStoneConnectChargeStatus("processing")).toBe("pending");
  });
});
