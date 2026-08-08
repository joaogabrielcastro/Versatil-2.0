import { describe, expect, it } from "vitest";
import {
  getPaymentProvider,
  listPaymentProviders,
  providersWithCapability,
} from "@/lib/payments/registry";
import { providerSupports } from "@/lib/payments/provider";
import {
  PAYMENT_PROVIDER_IDS,
  PaymentProviderError,
} from "@/lib/payments/types";

describe("payments registry", () => {
  it("registra todos os provedores conhecidos", () => {
    const ids = listPaymentProviders().map((p) => p.id).sort();
    expect(ids).toEqual([...PAYMENT_PROVIDER_IDS].sort());
  });

  it("resolve provedor por id", () => {
    expect(getPaymentProvider("manual").id).toBe("manual");
    expect(getPaymentProvider("pagarme").id).toBe("pagarme");
    expect(getPaymentProvider("stone_connect").id).toBe("stone_connect");
  });

  it("mapeia capabilities corretamente", () => {
    expect(providerSupports(getPaymentProvider("manual"), "manual_settlement")).toBe(true);
    expect(providerSupports(getPaymentProvider("manual"), "pos_terminal")).toBe(false);
    expect(providerSupports(getPaymentProvider("pagarme"), "online_recurring")).toBe(true);
    expect(providerSupports(getPaymentProvider("stone_connect"), "pos_terminal")).toBe(true);
  });

  it("filtra provedores por capability", () => {
    expect(providersWithCapability("online_recurring").map((p) => p.id)).toEqual([
      "pagarme",
    ]);
    expect(providersWithCapability("pos_terminal").map((p) => p.id)).toEqual([
      "stone_connect",
    ]);
    expect(providersWithCapability("manual_settlement").map((p) => p.id)).toEqual([
      "manual",
    ]);
  });
});

describe("pagarme (Fase 1)", () => {
  it("createRecurringCharge exige cartão salvo (card_id)", async () => {
    const p = getPaymentProvider("pagarme");
    await expect(
      p.createRecurringCharge!({
        tenantId: "t",
        subscriptionId: "s",
        studentId: "st",
        amountCents: 1000,
        currency: "BRL",
      }),
    ).rejects.toBeInstanceOf(PaymentProviderError);
  });
});

describe("stone_connect (Fase 2)", () => {
  it("chargeOnTerminal rejeita sem configuração", async () => {
    const p = getPaymentProvider("stone_connect");
    // Sem config/DB no unit test, deve rejeitar (não resolver silenciosamente).
    await expect(
      p.chargeOnTerminal!({
        tenantId: "t",
        invoiceId: "i",
        studentId: "s",
        amountCents: 1000,
        currency: "BRL",
        terminalSerial: "ABC123",
      }),
    ).rejects.toThrow();
  });
});
