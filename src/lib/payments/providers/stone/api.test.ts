import { describe, expect, it } from "vitest";
import { buildPosOrderPayload } from "@/lib/payments/providers/stone/api";

const base = {
  invoiceId: "inv-12345678",
  tenantId: "ten-1",
  studentId: "stu-1",
  amountCents: 12500,
  description: "Mensalidade",
  customerName: "João",
  terminalSerials: ["6N021234"],
};

describe("buildPosOrderPayload", () => {
  it("cria pedido aberto com poi_payment_settings e metadata", () => {
    const p = buildPosOrderPayload({ ...base, paymentType: "credit", installments: 3 });
    expect(p.closed).toBe(false);
    expect(p.code).toBe("inv-12345678");
    expect((p.metadata as Record<string, unknown>).invoiceId).toBe("inv-12345678");
    const poi = p.poi_payment_settings as Record<string, unknown>;
    expect(poi.devices_serial_number).toEqual(["6N021234"]);
    expect(poi.payment_setup).toMatchObject({
      type: "credit",
      installments: 3,
      installment_type: "merchant",
    });
  });

  it("débito força 1 parcela", () => {
    const p = buildPosOrderPayload({ ...base, paymentType: "debit", installments: 6 });
    const poi = p.poi_payment_settings as Record<string, unknown>;
    expect((poi.payment_setup as Record<string, unknown>).installments).toBe(1);
  });

  it("não inclui array payments (pagamento é no POS)", () => {
    const p = buildPosOrderPayload({ ...base, paymentType: "credit" });
    expect(p.payments).toBeUndefined();
  });

  it("garante amount mínimo de 1", () => {
    const p = buildPosOrderPayload({ ...base, amountCents: 0, paymentType: "credit" });
    const item = (p.items as Record<string, unknown>[])[0]!;
    expect(item.amount).toBe(1);
  });
});
