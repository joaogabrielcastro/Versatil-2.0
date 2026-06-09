export const MANUAL_PAYMENT_METHODS = [
  "cash",
  "pix",
  "stone_card",
] as const;

export type ManualPaymentMethod = (typeof MANUAL_PAYMENT_METHODS)[number];

export const MANUAL_PAYMENT_LABELS: Record<ManualPaymentMethod, string> = {
  cash: "Dinheiro",
  pix: "Pix",
  stone_card: "Cartão Stone",
};

export function manualPaymentLabel(method: string | null | undefined): string {
  if (!method) return "Balcão";
  return MANUAL_PAYMENT_LABELS[method as ManualPaymentMethod] ?? method;
}
