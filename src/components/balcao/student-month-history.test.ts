import { describe, expect, it } from "vitest";
import { buildMonthCells } from "./student-month-history";

describe("buildMonthCells", () => {
  it("marca mês pago e inadimplente", () => {
    const now = new Date("2026-07-15T12:00:00");
    const cells = buildMonthCells(
      [
        {
          status: "paid",
          dueAt: "2026-06-10T00:00:00.000Z",
          paidAt: "2026-06-08T00:00:00.000Z",
          amountCents: 10000,
        },
        {
          status: "open",
          dueAt: "2026-05-10T00:00:00.000Z",
          paidAt: null,
          amountCents: 10000,
        },
      ],
      2,
      now,
    );
    const jun = cells.find((c) => c.key === "2026-06");
    const mai = cells.find((c) => c.key === "2026-05");
    expect(jun?.status).toBe("paid");
    expect(mai?.status).toBe("overdue");
  });

  it("separa serviço vencido de inadimplência", () => {
    const now = new Date("2026-07-15T12:00:00");
    const cells = buildMonthCells(
      [
        {
          status: "open",
          dueAt: "2026-06-10T00:00:00.000Z",
          paidAt: null,
          amountCents: 20000,
          purpose: "fee",
          accessEffect: "none",
        },
      ],
      2,
      now,
    );
    expect(cells.find((cell) => cell.key === "2026-06")?.status).toBe("service");
  });
});
