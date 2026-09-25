import {
  billingIntervalLabel,
  type BillingInterval,
} from "@/lib/billing/interval-labels";

export type PlanKind = "subscription" | "fee";

export type CatalogPlan = {
  code: string;
  name: string;
  category: string;
  priceCents: number;
  billingInterval: BillingInterval;
  kind: PlanKind;
  termMonths: number | null;
};

export type CatalogSlot = {
  weekday: number;
  startTime: string;
};

export type CatalogActivity = {
  code: string;
  name: string;
  category: string;
  sortOrder: number;
  slots: CatalogSlot[];
};

/** Tabela da Academia Versátil e do CrossFit, na mesma unidade. */
export const VERSATIL_PLANS: CatalogPlan[] = [
  {
    code: "academia-mensal-vista",
    name: "Musculação mensal à vista",
    category: "Academia",
    priceCents: 14400,
    billingInterval: "monthly",
    kind: "subscription",
    termMonths: null,
  },
  {
    code: "academia-mensal-recorrente",
    name: "Musculação mensal recorrente (cartão)",
    category: "Academia",
    priceCents: 12400,
    billingInterval: "monthly",
    kind: "subscription",
    termMonths: null,
  },
  {
    code: "academia-trimestral",
    name: "Musculação trimestral",
    category: "Academia",
    priceCents: 13400,
    billingInterval: "monthly",
    kind: "subscription",
    termMonths: 3,
  },
  {
    code: "academia-semestral",
    name: "Musculação semestral",
    category: "Academia",
    priceCents: 12900,
    billingInterval: "monthly",
    kind: "subscription",
    termMonths: 6,
  },
  {
    code: "academia-anual",
    name: "Musculação anual",
    category: "Academia",
    priceCents: 12400,
    billingInterval: "monthly",
    kind: "subscription",
    termMonths: 12,
  },
  {
    code: "familia-dupla",
    name: "Família dupla",
    category: "Família",
    priceCents: 12900,
    billingInterval: "monthly",
    kind: "subscription",
    termMonths: null,
  },
  {
    code: "familia-trio",
    name: "Família trio",
    category: "Família",
    priceCents: 12800,
    billingInterval: "monthly",
    kind: "subscription",
    termMonths: null,
  },
  {
    code: "familia-4",
    name: "Família 4 ou mais",
    category: "Família",
    priceCents: 12400,
    billingInterval: "monthly",
    kind: "subscription",
    termMonths: null,
  },
  {
    code: "lutas-mensal",
    name: "Lutas",
    category: "Lutas",
    priceCents: 11400,
    billingInterval: "monthly",
    kind: "subscription",
    termMonths: null,
  },
  {
    code: "crossfit-3x-mensal",
    name: "CrossFit 3x na semana mensal",
    category: "CrossFit 3x",
    priceCents: 21000,
    billingInterval: "monthly",
    kind: "subscription",
    termMonths: null,
  },
  {
    code: "crossfit-3x-trimestral",
    name: "CrossFit 3x na semana trimestral",
    category: "CrossFit 3x",
    priceCents: 19500,
    billingInterval: "monthly",
    kind: "subscription",
    termMonths: 3,
  },
  {
    code: "crossfit-3x-semestral",
    name: "CrossFit 3x na semana semestral",
    category: "CrossFit 3x",
    priceCents: 18500,
    billingInterval: "monthly",
    kind: "subscription",
    termMonths: 6,
  },
  {
    code: "crossfit-3x-anual",
    name: "CrossFit 3x na semana anual",
    category: "CrossFit 3x",
    priceCents: 18000,
    billingInterval: "monthly",
    kind: "subscription",
    termMonths: 12,
  },
  {
    code: "crossfit-livre-mensal",
    name: "CrossFit livre mensal",
    category: "CrossFit livre",
    priceCents: 23000,
    billingInterval: "monthly",
    kind: "subscription",
    termMonths: null,
  },
  {
    code: "crossfit-livre-trimestral",
    name: "CrossFit livre trimestral",
    category: "CrossFit livre",
    priceCents: 21000,
    billingInterval: "monthly",
    kind: "subscription",
    termMonths: 3,
  },
  {
    code: "crossfit-livre-semestral",
    name: "CrossFit livre semestral",
    category: "CrossFit livre",
    priceCents: 19500,
    billingInterval: "monthly",
    kind: "subscription",
    termMonths: 6,
  },
  {
    code: "crossfit-livre-anual",
    name: "CrossFit livre anual",
    category: "CrossFit livre",
    priceCents: 18000,
    billingInterval: "monthly",
    kind: "subscription",
    termMonths: 12,
  },
  {
    code: "crossfit-livre-trimestral-vista",
    name: "CrossFit livre trimestral à vista",
    category: "CrossFit livre",
    priceCents: 55000,
    billingInterval: "quarterly",
    kind: "subscription",
    termMonths: 3,
  },
  {
    code: "crossfit-livre-semestral-vista",
    name: "CrossFit livre semestral à vista",
    category: "CrossFit livre",
    priceCents: 99000,
    billingInterval: "semesterly",
    kind: "subscription",
    termMonths: 6,
  },
  {
    code: "crossfit-livre-anual-vista",
    name: "CrossFit livre anual à vista",
    category: "CrossFit livre",
    priceCents: 180000,
    billingInterval: "yearly",
    kind: "subscription",
    termMonths: 12,
  },
  {
    code: "taxa-matricula-academia",
    name: "Matrícula",
    category: "Taxas",
    priceCents: 3000,
    billingInterval: "monthly",
    kind: "fee",
    termMonths: null,
  },
  {
    code: "taxa-nutricionista",
    name: "Nutricionista",
    category: "Taxas",
    priceCents: 20000,
    billingInterval: "monthly",
    kind: "fee",
    termMonths: null,
  },
  {
    code: "taxa-avaliacao-fisica",
    name: "Avaliação física",
    category: "Taxas",
    priceCents: 3000,
    billingInterval: "monthly",
    kind: "fee",
    termMonths: null,
  },
  {
    code: "taxa-matricula-crossfit",
    name: "Matrícula CrossFit",
    category: "Taxas",
    priceCents: 5000,
    billingInterval: "monthly",
    kind: "fee",
    termMonths: null,
  },
  {
    code: "taxa-aula-avulsa-crossfit",
    name: "Aula avulsa CrossFit",
    category: "Taxas",
    priceCents: 4000,
    billingInterval: "monthly",
    kind: "fee",
    termMonths: null,
  },
];

const tueThu = (startTime: string): CatalogSlot[] => [
  { weekday: 2, startTime },
  { weekday: 4, startTime },
];

const monWed = (startTime: string): CatalogSlot[] => [
  { weekday: 1, startTime },
  { weekday: 3, startTime },
];

const monWedFri = (startTime: string): CatalogSlot[] => [
  { weekday: 1, startTime },
  { weekday: 3, startTime },
  { weekday: 5, startTime },
];

/** Grade do cartaz da unidade de Colombo. */
export const VERSATIL_ACTIVITIES: CatalogActivity[] = [
  {
    code: "ritmos",
    name: "Ritmos",
    category: "Ginástica e Dança",
    sortOrder: 10,
    slots: tueThu("15:00"),
  },
  {
    code: "circuito-funcional",
    name: "Circuito funcional",
    category: "Ginástica e Dança",
    sortOrder: 20,
    slots: monWed("18:00"),
  },
  {
    code: "jump",
    name: "Jump",
    category: "Ginástica e Dança",
    sortOrder: 30,
    slots: tueThu("19:10"),
  },
  {
    code: "move-dance",
    name: "Move Dance",
    category: "Ginástica e Dança",
    sortOrder: 40,
    slots: tueThu("19:40"),
  },
  {
    code: "spinning",
    name: "Spinning",
    category: "Spinning",
    sortOrder: 50,
    slots: [
      ...tueThu("07:00"),
      ...tueThu("18:30"),
      ...monWedFri("19:00"),
    ],
  },
  {
    code: "jiu-jitsu",
    name: "Jiu-jitsu",
    category: "Lutas",
    sortOrder: 60,
    slots: [...tueThu("17:00"), ...monWedFri("20:00")],
  },
  {
    code: "boxe",
    name: "Boxe",
    category: "Lutas",
    sortOrder: 70,
    slots: tueThu("19:00"),
  },
  {
    code: "muay-thai",
    name: "Muay Thai",
    category: "Lutas",
    sortOrder: 80,
    slots: tueThu("20:00"),
  },
];

export const PLAN_CATEGORY_ORDER = [
  "Academia",
  "Família",
  "Lutas",
  "CrossFit 3x",
  "CrossFit livre",
  "Taxas",
] as const;

export function groupPlansByCategory<T extends { category: string | null }>(
  items: T[],
): Array<[string, T[]]> {
  const buckets = new Map<string, T[]>();
  for (const item of items) {
    const key = item.category?.trim() || "Outros";
    const list = buckets.get(key) ?? [];
    list.push(item);
    buckets.set(key, list);
  }
  const keys = [...buckets.keys()].sort((a, b) => {
    const ia = PLAN_CATEGORY_ORDER.indexOf(a as (typeof PLAN_CATEGORY_ORDER)[number]);
    const ib = PLAN_CATEGORY_ORDER.indexOf(b as (typeof PLAN_CATEGORY_ORDER)[number]);
    if (ia === -1 && ib === -1) return a.localeCompare(b, "pt-BR");
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
  return keys.map((key) => [key, buckets.get(key)!]);
}

export function planChargeLabel(plan: {
  kind: string;
  billingInterval: string;
  termMonths: number | null;
}): string {
  if (plan.kind === "fee") return "Taxa avulsa";
  if (plan.billingInterval === "monthly" && plan.termMonths) {
    return `${plan.termMonths} parcelas mensais`;
  }
  if (plan.billingInterval !== "monthly" && plan.termMonths) {
    return `${billingIntervalLabel(plan.billingInterval)} à vista`;
  }
  return billingIntervalLabel(plan.billingInterval);
}
