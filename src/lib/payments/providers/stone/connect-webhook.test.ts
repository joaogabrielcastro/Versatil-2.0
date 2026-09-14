import { createHmac } from "crypto";
import { describe, expect, it } from "vitest";
import {
  connectWebhookAmountCents,
  connectWebhookChargeId,
  mapStoneConnectEventType,
  normalizeStoneConnectWebhook,
  verifyStoneConnectWebhookSignature,
} from "@/lib/payments/providers/stone/connect-webhook";

describe("verifyStoneConnectWebhookSignature", () => {
  const secret = "whsec_123";
  const body = '{"id":"ev_1","type":"charge.paid"}';
  const sig = createHmac("sha256", secret).update(body).digest("hex");

  it("aceita assinatura correta (com e sem prefixo)", () => {
    expect(verifyStoneConnectWebhookSignature(body, sig, secret)).toBe(true);
    expect(verifyStoneConnectWebhookSignature(body, `sha256=${sig}`, secret)).toBe(
      true,
    );
  });

  it("rejeita assinatura errada ou ausente", () => {
    expect(verifyStoneConnectWebhookSignature(body, "deadbeef", secret)).toBe(
      false,
    );
    expect(verifyStoneConnectWebhookSignature(body, null, secret)).toBe(false);
    expect(verifyStoneConnectWebhookSignature(body + "x", sig, secret)).toBe(
      false,
    );
  });
});

describe("mapStoneConnectEventType", () => {
  it("mapeia pagos e falhas do envelope Core", () => {
    expect(mapStoneConnectEventType("charge.paid")).toBe("invoice.paid");
    expect(mapStoneConnectEventType("order.paid")).toBe("invoice.paid");
    expect(mapStoneConnectEventType("charge.payment_failed")).toBe(
      "invoice.payment_failed",
    );
    expect(mapStoneConnectEventType("charge.failed")).toBe(
      "invoice.payment_failed",
    );
    expect(mapStoneConnectEventType("charge.created")).toBeNull();
  });
});

describe("normalizeStoneConnectWebhook", () => {
  it("extrai invoiceId de metadata", () => {
    const ev = normalizeStoneConnectWebhook({
      id: "hook_1",
      type: "charge.paid",
      data: { id: "ch_1", metadata: { invoiceId: "inv-42" } },
    });
    expect(ev).toMatchObject({
      provider: "stone_connect",
      eventId: "hook_1",
      type: "invoice.paid",
      invoiceId: "inv-42",
    });
  });

  it("cai para code quando não há metadata", () => {
    const ev = normalizeStoneConnectWebhook({
      id: "hook_2",
      type: "charge.payment_failed",
      data: { id: "ch_2", code: "inv-77", amount: 9900 },
    });
    expect(ev?.invoiceId).toBe("inv-77");
    expect(ev?.type).toBe("invoice.payment_failed");
    expect(connectWebhookChargeId(ev!.raw as { data?: { id?: string } })).toBe(
      "ch_2",
    );
    expect(
      connectWebhookAmountCents(ev!.raw as { data?: { amount?: number } }),
    ).toBe(9900);
  });

  it("ignora eventos não mapeados", () => {
    expect(
      normalizeStoneConnectWebhook({ id: "h", type: "charge.created", data: {} }),
    ).toBeNull();
  });
});
