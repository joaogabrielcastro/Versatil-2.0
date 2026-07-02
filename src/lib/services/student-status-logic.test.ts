import { describe, expect, it } from "vitest";
import {
  computeStudentStatus,
  isSubscriptionActiveAt,
} from "@/lib/services/student-status-logic";

describe("student status logic", () => {
  it("prioriza inadimplência", () => {
    expect(
      computeStudentStatus({ hasBadInvoice: true, hasActivePlan: true }),
    ).toBe("delinquent");
  });

  it("marca ativo com plano e sem pendência", () => {
    expect(
      computeStudentStatus({ hasBadInvoice: false, hasActivePlan: true }),
    ).toBe("active");
  });

  it("marca inativo sem plano", () => {
    expect(
      computeStudentStatus({ hasBadInvoice: false, hasActivePlan: false }),
    ).toBe("inactive");
  });

  it("valida assinatura vigente", () => {
    const now = new Date("2026-06-01T12:00:00.000Z");
    expect(
      isSubscriptionActiveAt(
        new Date("2026-01-01T00:00:00.000Z"),
        new Date("2026-12-31T23:59:59.000Z"),
        now,
      ),
    ).toBe(true);
    expect(
      isSubscriptionActiveAt(
        new Date("2026-07-01T00:00:00.000Z"),
        null,
        now,
      ),
    ).toBe(false);
  });
});
