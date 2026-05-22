"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

export function PrintToolbar({ backHref }: { backHref: string }) {
  return (
    <div className="no-print mx-auto max-w-2xl px-6 py-4">
      <Link
        href={backHref}
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← Voltar à ficha
      </Link>
      <Button type="button" className="ml-4" size="sm" onClick={() => window.print()}>
        Imprimir
      </Button>
      <p className="mt-2 text-xs text-muted-foreground">
        Impressora de <strong>cupom 80mm</strong> (térmica). No diálogo de impressão,
        escolha o papel estreito / bobina e margens mínimas. Use Ctrl+P se precisar.
      </p>
    </div>
  );
}
