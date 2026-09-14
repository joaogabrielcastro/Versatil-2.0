import { describe, expect, it } from "vitest";
import { decideStoneChargeAction } from "@/lib/payments/stone-idempotency";

describe("decideStoneChargeAction", () => {
  it("não cria outra cobrança se já paga", () => {
    expect(
      decideStoneChargeAction({
        status: "paid",
        gatewayChargeStatus: "succeeded",
        externalId: "chg_1",
      }),
    ).toEqual({ action: "reject_paid" });
  });

  it("reutiliza cobrança pendente com externalId", () => {
    expect(
      decideStoneChargeAction({
        status: "open",
        gatewayChargeStatus: "pending",
        externalId: "chg_1",
      }),
    ).toEqual({ action: "reuse", externalId: "chg_1" });
  });

  it("bloqueia cobrança in-flight sem externalId", () => {
    expect(
      decideStoneChargeAction({
        status: "open",
        gatewayChargeStatus: "pending",
        externalId: null,
      }),
    ).toEqual({ action: "in_flight" });
  });

  it("permite criar quando ociosa", () => {
    expect(
      decideStoneChargeAction({
        status: "open",
        gatewayChargeStatus: "idle",
        externalId: null,
      }),
    ).toEqual({ action: "create" });
  });

  it("rejeita fatura cancelada", () => {
    expect(
      decideStoneChargeAction({
        status: "void",
        gatewayChargeStatus: "canceled",
        externalId: null,
      }),
    ).toEqual({ action: "reject_void" });
  });
});
