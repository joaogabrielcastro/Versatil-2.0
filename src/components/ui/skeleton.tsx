import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-muted", className)}
      aria-hidden
    />
  );
}

export function TableSkeleton({ rows = 5, cols = 3 }: { rows?: number; cols?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i} className="border-t border-border">
          {Array.from({ length: cols }).map((__, j) => (
            <td key={j} className="px-3 py-3">
              <Skeleton className="h-4 w-full max-w-[12rem]" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
