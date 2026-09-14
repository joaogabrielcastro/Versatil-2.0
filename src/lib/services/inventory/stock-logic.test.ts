import { describe, expect, it } from "vitest";
import {
  computeStockAfterMovement,
  lineTotalCents,
  mergeSaleLines,
  stockStatus,
} from "./stock-logic";

describe("computeStockAfterMovement", () => {
  it("soma entrada", () => {
    expect(
      computeStockAfterMovement({ current: 4, type: "in", quantity: 6 }),
    ).toEqual({ ok: true, resulting: 10, recordedQuantity: 6 });
  });

  it("baixa saída e venda", () => {
    expect(
      computeStockAfterMovement({ current: 10, type: "out", quantity: 3 }),
    ).toEqual({ ok: true, resulting: 7, recordedQuantity: 3 });
    expect(
      computeStockAfterMovement({ current: 2, type: "sale", quantity: 2 }),
    ).toEqual({ ok: true, resulting: 0, recordedQuantity: 2 });
  });

  it("bloqueia estoque insuficiente", () => {
    expect(
      computeStockAfterMovement({ current: 1, type: "sale", quantity: 2 }),
    ).toEqual({ ok: false, reason: "insufficient" });
  });

  it("ajuste define o estoque-alvo", () => {
    expect(
      computeStockAfterMovement({ current: 8, type: "adjust", quantity: 5 }),
    ).toEqual({ ok: true, resulting: 5, recordedQuantity: 3 });
    expect(
      computeStockAfterMovement({ current: 2, type: "adjust", quantity: 10 }),
    ).toEqual({ ok: true, resulting: 10, recordedQuantity: 8 });
  });

  it("rejeita ajuste sem mudança e quantidade inválida", () => {
    expect(
      computeStockAfterMovement({ current: 4, type: "adjust", quantity: 4 }),
    ).toEqual({ ok: false, reason: "unchanged" });
    expect(
      computeStockAfterMovement({ current: 4, type: "in", quantity: 0 }),
    ).toEqual({ ok: false, reason: "invalid" });
    expect(
      computeStockAfterMovement({ current: 4, type: "in", quantity: 1.5 }),
    ).toEqual({ ok: false, reason: "invalid" });
  });
});

describe("mergeSaleLines", () => {
  it("agrupa o mesmo produto e ignora quantidade inválida", () => {
    expect(
      mergeSaleLines([
        { productId: "b", quantity: 1 },
        { productId: "a", quantity: 2 },
        { productId: "a", quantity: 3 },
        { productId: "c", quantity: 0 },
      ]),
    ).toEqual([
      { productId: "a", quantity: 5 },
      { productId: "b", quantity: 1 },
    ]);
  });
});

describe("stock helpers", () => {
  it("calcula total da linha e status", () => {
    expect(lineTotalCents(1290, 3)).toBe(3870);
    expect(stockStatus(0, 5)).toBe("out");
    expect(stockStatus(3, 5)).toBe("low");
    expect(stockStatus(12, 5)).toBe("ok");
  });
});
