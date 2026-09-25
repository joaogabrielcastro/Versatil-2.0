export const BILLING_INTERVALS = [
  "monthly",
  "quarterly",
  "semesterly",
  "yearly",
] as const;

export type BillingInterval = (typeof BILLING_INTERVALS)[number];

export const BILLING_INTERVAL_LABELS: Record<BillingInterval, string> = {
  monthly: "Mensal",
  quarterly: "Trimestral",
  semesterly: "Semestral",
  yearly: "Anual",
};

export function isBillingInterval(value: string): value is BillingInterval {
  return (BILLING_INTERVALS as readonly string[]).includes(value);
}

export function billingIntervalLabel(value: string): string {
  return BILLING_INTERVAL_LABELS[value as BillingInterval] ?? value;
}
