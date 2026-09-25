import { describe, expect, it } from "vitest";
import {
  canSendToPos,
  financeSituation,
  manualSettlementBlockReason,
  posSituation,
} from "@/lib/billing/invoice-situation";

describe("situação da cobrança", () => {
  const now = new Date("2026-09-25T18:00:00.000Z");

  it("separa fatura do dia de fatura vencida", () => {
    expect(financeSituation("open", "2026-09-25T15:00:00.000Z", now)).toBe("open");
    expect(financeSituation("open", "2026-09-24T15:00:00.000Z", now)).toBe("overdue");
    expect(financeSituation("void", "2026-09-24T15:00:00.000Z", now)).toBe("void");
    expect(financeSituation("paid", "2026-09-24T15:00:00.000Z", now)).toBe("paid");
  });

  it("não trata ausência de resposta como recusa", () => {
    expect(
      posSituation({
        gatewayChargeStatus: "pending",
        gatewayIdempotencyKey: "ux-pending",
        externalId: null,
      }),
    ).toBe("unknown");
    expect(posSituation({ gatewayChargeStatus: "pending", externalId: "ch_1" })).toBe(
      "pending",
    );
    expect(posSituation({ gatewayChargeStatus: "failed" })).toBe("refused");
    expect(canSendToPos("unknown", "open")).toBe(false);
    expect(canSendToPos("pending", "overdue")).toBe(false);
    expect(canSendToPos("refused", "overdue")).toBe(true);
    expect(manualSettlementBlockReason("unknown")).toMatch(/maquininha/i);
    expect(manualSettlementBlockReason("refused")).toBeNull();
  });
});
