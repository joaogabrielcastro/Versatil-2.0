export const STOCK_MOVEMENT_TYPES = ["in", "out", "adjust", "sale"] as const;
export type StockMovementType = (typeof STOCK_MOVEMENT_TYPES)[number];

export type StockComputeOk = {
  ok: true;
  resulting: number;
  recordedQuantity: number;
};

export type StockComputeErr = {
  ok: false;
  reason: "invalid" | "insufficient" | "unchanged";
};

export type SaleLineInput = {
  productId: string;
  quantity: number;
};

/** Entrada/saída usam `quantity` como delta; ajuste usa `quantity` como estoque-alvo. */
export function computeStockAfterMovement(input: {
  current: number;
  type: StockMovementType;
  quantity: number;
}): StockComputeOk | StockComputeErr {
  if (!Number.isInteger(input.current) || input.current < 0) {
    return { ok: false, reason: "invalid" };
  }
  if (!Number.isInteger(input.quantity) || input.quantity < 0) {
    return { ok: false, reason: "invalid" };
  }

  if (input.type === "adjust") {
    if (input.quantity === input.current) {
      return { ok: false, reason: "unchanged" };
    }
    return {
      ok: true,
      resulting: input.quantity,
      recordedQuantity: Math.abs(input.quantity - input.current),
    };
  }

  if (input.quantity <= 0) {
    return { ok: false, reason: "invalid" };
  }

  if (input.type === "in") {
    return {
      ok: true,
      resulting: input.current + input.quantity,
      recordedQuantity: input.quantity,
    };
  }

  if (input.quantity > input.current) {
    return { ok: false, reason: "insufficient" };
  }
  return {
    ok: true,
    resulting: input.current - input.quantity,
    recordedQuantity: input.quantity,
  };
}

export function mergeSaleLines(lines: SaleLineInput[]): SaleLineInput[] {
  const byId = new Map<string, number>();
  for (const line of lines) {
    if (!Number.isInteger(line.quantity) || line.quantity <= 0) continue;
    byId.set(line.productId, (byId.get(line.productId) ?? 0) + line.quantity);
  }
  return [...byId.entries()]
    .map(([productId, quantity]) => ({ productId, quantity }))
    .sort((a, b) => a.productId.localeCompare(b.productId));
}

export function lineTotalCents(unitPriceCents: number, quantity: number): number {
  return unitPriceCents * quantity;
}

export function stockStatus(
  quantityOnHand: number,
  lowStockThreshold: number,
): "ok" | "low" | "out" {
  if (quantityOnHand <= 0) return "out";
  if (quantityOnHand <= lowStockThreshold) return "low";
  return "ok";
}
