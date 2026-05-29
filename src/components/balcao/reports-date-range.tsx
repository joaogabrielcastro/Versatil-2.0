"use client";

import { Button } from "@/components/ui/button";
import { BrDateInput } from "@/components/ui/br-date-input";
import {
  formatIsoDateBr,
  parseDateBr,
  toIsoDateInTz,
} from "@/lib/dates/br";

type Props = {
  fromInput: string;
  toInput: string;
  onFromChange: (v: string) => void;
  onToChange: (v: string) => void;
  onApply: (fromIso: string, toIso: string) => void;
  busy?: boolean;
};

export function ReportsDateRange({
  fromInput,
  toInput,
  onFromChange,
  onToChange,
  onApply,
  busy,
}: Props) {
  function apply() {
    const fromParsed = parseDateBr(fromInput);
    const toParsed = parseDateBr(toInput);
    if (!fromParsed || !toParsed) return;
    const fromIso = toIsoDateInTz(fromParsed);
    const toIso = toIsoDateInTz(toParsed);
    onApply(fromIso, toIso);
    onFromChange(formatIsoDateBr(fromIso));
    onToChange(formatIsoDateBr(toIso));
  }

  function setLast30Days() {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - 30);
    const fromIso = toIsoDateInTz(from);
    const toIso = toIsoDateInTz(to);
    onFromChange(formatIsoDateBr(fromIso));
    onToChange(formatIsoDateBr(toIso));
    onApply(fromIso, toIso);
  }

  function setThisMonth() {
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    const fromIso = toIsoDateInTz(from);
    const toIso = toIsoDateInTz(now);
    onFromChange(formatIsoDateBr(fromIso));
    onToChange(formatIsoDateBr(toIso));
    onApply(fromIso, toIso);
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1 text-sm">
        De
        <BrDateInput value={fromInput} onChange={onFromChange} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Até
        <BrDateInput value={toInput} onChange={onToChange} />
      </label>
      <Button type="button" variant="outline" disabled={busy} onClick={apply}>
        Atualizar
      </Button>
      <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={setLast30Days}>
        Últimos 30 dias
      </Button>
      <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={setThisMonth}>
        Mês atual
      </Button>
    </div>
  );
}
