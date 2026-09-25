import { describe, expect, it } from "vitest";
import { stoneWebhookBodySchema } from "@/lib/integrations/stone-webhook";
import {
  assertPaidWebhookMatchesInvoice,
  assertFailureChargeMatchesInvoice,
} from "@/lib/payments/paid-webhook-match";
import { connectWebhookCurrency } from "@/lib/payments/providers/stone/connect-webhook";
import { POST as gatewayPost } from "@/app/api/webhooks/gateway/route";

const invoice = {
  amountCents: 9900,
  currency: "BRL",
  externalId: "ch_invoice",
  status: "open",
};

describe("assertPaidWebhookMatchesInvoice", () => {
  it("rejeita evento sem valor, sem moeda e sem cobrança", () => {
    expect(
      assertPaidWebhookMatchesInvoice({ chargeId: "ch_invoice" }, invoice).ok,
    ).toBe(false);
    expect(
      assertPaidWebhookMatchesInvoice(
        { chargeId: "ch_invoice", amountCents: 9900 },
        invoice,
      ).ok,
    ).toBe(false);
    expect(
      assertPaidWebhookMatchesInvoice(
        { amountCents: 9900, currency: "BRL" },
        invoice,
      ).ok,
    ).toBe(false);
  });

  it("rejeita valor divergente e moeda divergente", () => {
    const amount = assertPaidWebhookMatchesInvoice(
      { chargeId: "ch_invoice", amountCents: 100, currency: "BRL" },
      invoice,
    );
    const currency = assertPaidWebhookMatchesInvoice(
      { chargeId: "ch_invoice", amountCents: 9900, currency: "USD" },
      invoice,
    );
    expect(amount.ok).toBe(false);
    expect(currency.ok).toBe(false);
    if (!amount.ok) expect(amount.reason).toMatch(/Valor/);
    if (!currency.ok) expect(currency.reason).toMatch(/Moeda/);
  });

  it("rejeita cobrança de outra fatura e fatura sem vínculo", () => {
    const other = assertPaidWebhookMatchesInvoice(
      { chargeId: "ch_other", amountCents: 9900, currency: "BRL" },
      invoice,
    );
    const unbound = assertPaidWebhookMatchesInvoice(
      { chargeId: "ch_new", amountCents: 9900, currency: "BRL" },
      { ...invoice, externalId: null },
    );
    expect(other.ok).toBe(false);
    expect(unbound.ok).toBe(false);
    if (!other.ok) expect(other.reason).toMatch(/não pertence/);
    if (!unbound.ok) expect(unbound.reason).toMatch(/sem cobrança/);
  });

  it("aceita valor, moeda e cobrança iguais", () => {
    expect(
      assertPaidWebhookMatchesInvoice(
        { chargeId: "ch_invoice", amountCents: 9900, currency: "brl" },
        invoice,
      ),
    ).toEqual({ ok: true });
  });
});

describe("assertFailureChargeMatchesInvoice", () => {
  it("não aplica falha de outra cobrança", () => {
    expect(assertFailureChargeMatchesInvoice("ch_other", invoice).ok).toBe(
      false,
    );
    expect(assertFailureChargeMatchesInvoice("ch_invoice", invoice).ok).toBe(
      true,
    );
  });
});

describe("contrato interno Stone", () => {
  const base = {
    tenantId: "00000000-0000-4000-8000-000000000001",
    eventId: "ev_1",
    type: "invoice.paid" as const,
    invoiceId: "00000000-0000-4000-8000-000000000002",
    stoneChargeId: "ch_1",
  };

  it("recusa pago sem valor ou sem moeda", () => {
    expect(stoneWebhookBodySchema.safeParse(base).success).toBe(false);
    expect(
      stoneWebhookBodySchema.safeParse({ ...base, amountCents: 9900 }).success,
    ).toBe(false);
    expect(
      stoneWebhookBodySchema.safeParse({
        ...base,
        amountCents: 9900,
        currency: "BRL",
      }).success,
    ).toBe(true);
  });
});

describe("connectWebhookCurrency", () => {
  it("não inventa BRL quando a moeda não vem no envelope", () => {
    expect(connectWebhookCurrency({ data: { amount: 9900 } })).toBeUndefined();
    expect(connectWebhookCurrency({ data: { currency: "brl" } })).toBe("BRL");
  });
});

describe("POST /api/webhooks/gateway", () => {
  it("não liquida mesmo com segredo e corpo de pago", async () => {
    const res = await gatewayPost();
    expect(res.status).toBe(410);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/não liquida/);
  });
});
