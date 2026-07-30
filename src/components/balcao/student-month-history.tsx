"use client";

type InvoiceLike = {
  status: string;
  dueAt: string;
  paidAt: string | null;
  amountCents: number;
};

export type MonthStatus = "paid" | "open" | "overdue" | "other";

export type MonthCell = {
  key: string; // yyyy-mm
  label: string;
  status: MonthStatus;
  amountCents: number;
};

/** Agrupa faturas por mês de vencimento (últimos N meses + próximos). */
export function buildMonthCells(
  invoices: InvoiceLike[],
  monthsBack = 11,
  now = new Date(),
): MonthCell[] {
  const byMonth = new Map<string, InvoiceLike[]>();
  for (const inv of invoices) {
    const d = new Date(inv.dueAt);
    if (Number.isNaN(d.getTime())) continue;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const list = byMonth.get(key) ?? [];
    list.push(inv);
    byMonth.set(key, list);
  }

  const cells: MonthCell[] = [];
  for (let i = monthsBack; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("pt-BR", {
      month: "short",
      year: "2-digit",
    });
    const list = byMonth.get(key) ?? [];
    cells.push({
      key,
      label: label.replace(".", ""),
      status: summarizeMonth(list, now),
      amountCents: list.reduce((s, inv) => s + inv.amountCents, 0),
    });
  }
  return cells;
}

function summarizeMonth(list: InvoiceLike[], now: Date): MonthStatus {
  if (list.length === 0) return "other";
  const hasOverdue = list.some(
    (inv) =>
      inv.status === "open" && new Date(inv.dueAt).getTime() <= now.getTime(),
  );
  if (hasOverdue || list.some((inv) => inv.status === "uncollectible")) {
    return "overdue";
  }
  if (list.every((inv) => inv.status === "paid")) return "paid";
  if (list.some((inv) => inv.status === "open")) return "open";
  return "other";
}

const STATUS_CLASS: Record<MonthStatus, string> = {
  paid: "border-emerald-200 bg-emerald-50 text-emerald-800",
  open: "border-amber-200 bg-amber-50 text-amber-900",
  overdue: "border-red-200 bg-red-50 text-red-800",
  other: "border-border bg-muted/40 text-muted-foreground",
};

const STATUS_LABEL: Record<MonthStatus, string> = {
  paid: "Pago",
  open: "Em aberto",
  overdue: "Inadimplente",
  other: "Sem fatura",
};

export function StudentMonthHistory({ invoices }: { invoices: InvoiceLike[] }) {
  const cells = buildMonthCells(invoices);

  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <h3 className="text-sm font-medium">Histórico mensal</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Situação por mês de vencimento das faturas (últimos 12 meses).
      </p>
      <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
        {cells.map((c) => (
          <div
            key={c.key}
            className={`rounded-md border px-2 py-2 text-center ${STATUS_CLASS[c.status]}`}
            title={
              c.amountCents > 0
                ? `${STATUS_LABEL[c.status]} · ${(c.amountCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`
                : STATUS_LABEL[c.status]
            }
          >
            <p className="text-[11px] font-medium uppercase tracking-wide">
              {c.label}
            </p>
            <p className="mt-1 text-xs font-semibold">{STATUS_LABEL[c.status]}</p>
          </div>
        ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
        <li>
          <span className="mr-1 inline-block size-2 rounded-full bg-emerald-500" />
          Pago
        </li>
        <li>
          <span className="mr-1 inline-block size-2 rounded-full bg-amber-500" />
          Em aberto
        </li>
        <li>
          <span className="mr-1 inline-block size-2 rounded-full bg-red-500" />
          Inadimplente
        </li>
        <li>
          <span className="mr-1 inline-block size-2 rounded-full bg-zinc-300" />
          Sem fatura
        </li>
      </ul>
    </div>
  );
}
