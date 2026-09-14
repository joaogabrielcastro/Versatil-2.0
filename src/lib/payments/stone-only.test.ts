import { describe, expect, it } from "vitest";
import { shouldShowDemoCredentials } from "@/lib/ui/show-demo-credentials";
import { decideStoneChargeAction } from "@/lib/payments/stone-idempotency";

describe("Stone-only — regras de cobrança", () => {
  it("cobrança pendente com externalId não duplica", () => {
    expect(
      decideStoneChargeAction({
        status: "open",
        gatewayChargeStatus: "pending",
        externalId: "chg_pos_1",
      }),
    ).toEqual({ action: "reuse", externalId: "chg_pos_1" });
  });

  it("cobrança in-flight sem id externo bloqueia segunda tentativa", () => {
    expect(
      decideStoneChargeAction({
        status: "open",
        gatewayChargeStatus: "pending",
        externalId: null,
      }),
    ).toEqual({ action: "in_flight" });
  });

  it("falha anterior permite nova tentativa (retry)", () => {
    expect(
      decideStoneChargeAction({
        status: "open",
        gatewayChargeStatus: "failed",
        externalId: "chg_old",
      }),
    ).toEqual({ action: "create" });
  });

  it("sucesso não cobra de novo", () => {
    expect(
      decideStoneChargeAction({
        status: "open",
        gatewayChargeStatus: "succeeded",
        externalId: "chg_ok",
      }),
    ).toEqual({ action: "reject_paid" });
  });
});

describe("demo credentials", () => {
  it("nunca mostra na produção", () => {
    expect(
      shouldShowDemoCredentials({
        NODE_ENV: "production",
        SHOW_DEMO_CREDENTIALS: "true",
      }),
    ).toBe(false);
  });

  it("mostra só em desenvolvimento quando habilitado", () => {
    expect(
      shouldShowDemoCredentials({
        NODE_ENV: "development",
        SHOW_DEMO_CREDENTIALS: "true",
      }),
    ).toBe(true);
    expect(
      shouldShowDemoCredentials({
        NODE_ENV: "development",
        SHOW_DEMO_CREDENTIALS: "false",
      }),
    ).toBe(false);
  });
});
