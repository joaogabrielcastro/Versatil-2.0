import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type PageHeaderProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  backHref?: string;
  backLabel?: string;
  className?: string;
  children?: React.ReactNode;
};

export function PageHeader({
  eyebrow,
  title,
  description,
  backHref,
  backLabel = "Voltar",
  className,
  children,
}: PageHeaderProps) {
  return (
    <header className={cn("border-b border-border pb-6", className)}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          {backHref ? (
            <Button variant="ghost" size="sm" className="-ml-2 mb-2 h-8 px-2" asChild>
              <Link href={backHref}>← {backLabel}</Link>
            </Button>
          ) : null}
          {eyebrow ? (
            <p className="text-sm font-medium text-primary">{eyebrow}</p>
          ) : null}
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {description ? (
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {children ? <div className="flex shrink-0 flex-wrap gap-2">{children}</div> : null}
      </div>
    </header>
  );
}
