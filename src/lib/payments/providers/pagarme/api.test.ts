import { createHmac } from "crypto";
import { describe, expect, it } from "vitest";
import {
  buildAuthHeader,
  buildOrderPayload,
  mapPagarmeEventType,
  normalizePagarmeWebhook,
  verifyWebhookSignature,
} from "@/lib/payments/providers/pagarme/api";

describe("pagarme auth", () => {
  it("monta Basic Auth com secret key e senha vazia", () => {
    expect(buildAuthHeader("sk_test_abc")).toBe(
      `Basic ${Buffer.from("sk_test_abc:").toString("base64")}`,
    );
  });
});

describe("buildOrderPayload", () => {
  const base = {
    invoiceId: "inv-1",
    tenantId: "ten-1",
    studentId: "stu-1",
    amountCents: 9990,
    description: "Mensalidade",
    customer: { name: "João", document: "12345678901" },
  };

  it("pix inclui expires_in e metadata", () => {
    const p = buildOrderPayload({ ...base, method: "pix" });
    expect(p.code).toBe("inv-1");
    expect((p.metadata as Record<string, unknown>).invoiceId).toBe("inv-1");
    const payment = (p.payments as Record<string, unknown>[])[0]!;
    expect(payment.payment_method).toBe("pix");
    expect(payment.pix).toMatchObject({ expires_in: 3600 });
  });

  it("cartão salvo usa card_id", () => {
    const p = buildOrderPayload({ ...base, method: "credit_card", cardId: "card_9" });
    const payment = (p.payments as Record<string, unknown>[])[0]!;
    expect(payment.credit_card).toMatchObject({ card_id: "card_9", installments: 1 });
  });

  it("classifica documento CPF como individual", () => {
    const p = buildOrderPayload({ ...base, method: "boleto" });
    expect((p.customer as Record<string, unknown>).type).toBe("individual");
  });

  it("garante amount mínimo de 1", () => {
    const p = buildOrderPayload({ ...base, amountCents: 0, method: "pix" });
    const item = (p.items as Record<string, unknown>[])[0]!;
    expect(item.amount).toBe(1);
  });
});

describe("verifyWebhookSignature", () => {
  const secret = "whsec_123";
  const body = '{"id":"ev_1","type":"charge.paid"}';
  const sig = createHmac("sha256", secret).update(body).digest("hex");

  it("aceita assinatura correta (com e sem prefixo)", () => {
    expect(verifyWebhookSignature(body, sig, secret)).toBe(true);
    expect(verifyWebhookSignature(body, `sha256=${sig}`, secret)).toBe(true);
  });

  it("rejeita assinatura errada ou ausente", () => {
    expect(verifyWebhookSignature(body, "deadbeef", secret)).toBe(false);
    expect(verifyWebhookSignature(body, null, secret)).toBe(false);
    expect(verifyWebhookSignature(body + "x", sig, secret)).toBe(false);
  });
});

describe("mapPagarmeEventType", () => {
  it("mapeia pagos e falhas", () => {
    expect(mapPagarmeEventType("charge.paid")).toBe("invoice.paid");
    expect(mapPagarmeEventType("order.paid")).toBe("invoice.paid");
    expect(mapPagarmeEventType("charge.payment_failed")).toBe("invoice.payment_failed");
    expect(mapPagarmeEventType("charge.failed")).toBe("invoice.payment_failed");
    expect(mapPagarmeEventType("charge.created")).toBeNull();
  });
});

describe("normalizePagarmeWebhook", () => {
  it("extrai invoiceId de metadata", () => {
    const ev = normalizePagarmeWebhook({
      id: "hook_1",
      type: "charge.paid",
      data: { id: "ch_1", metadata: { invoiceId: "inv-42" } },
    });
    expect(ev).toMatchObject({
      provider: "pagarme",
      eventId: "hook_1",
      type: "invoice.paid",
      invoiceId: "inv-42",
    });
  });

  it("cai para code quando não há metadata", () => {
    const ev = normalizePagarmeWebhook({
      id: "hook_2",
      type: "charge.payment_failed",
      data: { id: "ch_2", code: "inv-77" },
    });
    expect(ev?.invoiceId).toBe("inv-77");
    expect(ev?.type).toBe("invoice.payment_failed");
  });

  it("ignora eventos não mapeados", () => {
    expect(
      normalizePagarmeWebhook({ id: "h", type: "charge.created", data: {} }),
    ).toBeNull();
  });
});
