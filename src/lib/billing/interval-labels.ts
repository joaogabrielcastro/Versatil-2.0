export const BILLING_INTERVALS = ["monthly", "semesterly", "yearly"] as const;

export type BillingInterval = (typeof BILLING_INTERVALS)[number];

export const BILLING_INTERVAL_LABELS: Record<BillingInterval, string> = {
  monthly: "Mensal",
  semesterly: "Semestral",
  yearly: "Anual",
};

export function billingIntervalLabel(value: string): string {
  return BILLING_INTERVAL_LABELS[value as BillingInterval] ?? value;
}
