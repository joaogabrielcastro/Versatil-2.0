import { STUDENT_STATUS_STYLES, studentStatusLabel } from "@/lib/labels";

export function StudentStatusBadge({ status }: { status: string }) {
  const style =
    STUDENT_STATUS_STYLES[status] ??
    "bg-zinc-100 text-zinc-600 border-zinc-200";
  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${style}`}
    >
      {studentStatusLabel(status)}
    </span>
  );
}
