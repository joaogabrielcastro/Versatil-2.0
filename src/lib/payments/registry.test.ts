import { describe, expect, it } from "vitest";
import {
  getPaymentProvider,
  listPaymentProviders,
  providersWithCapability,
} from "@/lib/payments/registry";
import { providerSupports } from "@/lib/payments/provider";
import {
  PAYMENT_PROVIDER_IDS,
  PaymentNotImplementedError,
  PaymentProviderError,
} from "@/lib/payments/types";

describe("payments registry", () => {
  it("registra somente os provedores do produto (manual + Stone)", () => {
    const ids = listPaymentProviders().map((p) => p.id).sort();
    expect(ids).toEqual([...PAYMENT_PROVIDER_IDS].sort());
    expect(ids).toEqual(["manual", "stone_connect"].sort());
    expect(ids).not.toContain("pagarme");
    expect(ids).not.toContain("stripe");
  });

  it("resolve provedor por id", () => {
    expect(getPaymentProvider("manual").id).toBe("manual");
    expect(getPaymentProvider("stone_connect").id).toBe("stone_connect");
  });

  it("mapeia capabilities corretamente", () => {
    expect(providerSupports(getPaymentProvider("manual"), "manual_settlement")).toBe(true);
    expect(providerSupports(getPaymentProvider("manual"), "pos_terminal")).toBe(false);
    expect(providerSupports(getPaymentProvider("stone_connect"), "pos_terminal")).toBe(true);
  });

  it("filtra provedores por capability", () => {
    expect(providersWithCapability("pos_terminal").map((p) => p.id)).toEqual([
      "stone_connect",
    ]);
    expect(providersWithCapability("manual_settlement").map((p) => p.id)).toEqual([
      "manual",
    ]);
  });
});

describe("stone_connect", () => {
  it("chargeOnTerminal rejeita sem configuração", async () => {
    const p = getPaymentProvider("stone_connect");
    await expect(
      p.chargeOnTerminal!({
        tenantId: "00000000-0000-0000-0000-000000000001",
        invoiceId: "00000000-0000-0000-0000-000000000002",
        studentId: "00000000-0000-0000-0000-000000000003",
        amountCents: 1000,
        currency: "BRL",
        terminalSerial: "ABC123",
      }),
    ).rejects.toThrow();
  });

  it("cancelamento não é inventado", async () => {
    const p = getPaymentProvider("stone_connect");
    await expect(p.cancelCharge!("00000000-0000-0000-0000-000000000001", "chg_1")).rejects.toBeInstanceOf(
      PaymentNotImplementedError,
    );
  });

  it("estorno não é inventado", async () => {
    const p = getPaymentProvider("stone_connect");
    await expect(p.refundCharge!("00000000-0000-0000-0000-000000000001", "chg_1")).rejects.toBeInstanceOf(
      PaymentNotImplementedError,
    );
  });

  it("getChargeStatus rejeita sem configuração", async () => {
    const p = getPaymentProvider("stone_connect");
    await expect(
      p.getChargeStatus!("00000000-0000-0000-0000-000000000001", "chg_1"),
    ).rejects.toBeInstanceOf(PaymentProviderError);
  });
});
