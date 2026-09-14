export type GatewayChargeStatus =
  | "idle"
  | "pending"
  | "succeeded"
  | "failed"
  | "canceled";

export type StoneChargeDecision =
  | { action: "reject_paid" }
  | { action: "reject_void" }
  | { action: "reuse"; externalId: string }
  | { action: "in_flight" }
  | { action: "create" };

export function decideStoneChargeAction(inv: {
  status: string;
  gatewayChargeStatus: string | null | undefined;
  externalId: string | null | undefined;
}): StoneChargeDecision {
  if (inv.status === "paid" || inv.gatewayChargeStatus === "succeeded") {
    return { action: "reject_paid" };
  }
  if (inv.status === "void") {
    return { action: "reject_void" };
  }
  if (inv.gatewayChargeStatus === "pending") {
    if (inv.externalId) {
      return { action: "reuse", externalId: inv.externalId };
    }
    return { action: "in_flight" };
  }
  return { action: "create" };
}

export function stoneAttemptKey(invoiceId: string, attempt: number): string {
  return `stone:${invoiceId}:${attempt}`;
}
