import { Suspense } from "react";

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-muted-foreground">Carregando…</div>}>
      {children}
    </Suspense>
  );
}
