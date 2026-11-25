import { Ban, Check, Minus } from "lucide-react";
import { STUDENT_STATUS_STYLES, studentStatusLabel } from "@/lib/labels";

/** Situação com ícone e texto: a cor nunca é a única pista (daltonismo, impressão). */
const ICONS: Record<string, typeof Check> = {
  active: Check,
  delinquent: Ban,
  inactive: Minus,
};

export function StudentStatusBadge({ status }: { status: string }) {
  const style = STUDENT_STATUS_STYLES[status] ?? "bg-muted text-muted-foreground border-border";
  const Icon = ICONS[status] ?? Minus;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${style}`}
    >
      <Icon className="size-3" aria-hidden strokeWidth={2.5} />
      {studentStatusLabel(status)}
    </span>
  );
}
