"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { readApiError } from "@/lib/api/read-error";

type ChargeResult = {
  chargeId: string;
  status: string;
  url: string | null;
  pixQrCode: string | null;
};

/** Botão de cobrança online via Pagar.me (Pix/Boleto) para uma fatura. */
export function PagarmeChargeButton({ invoiceId }: { invoiceId: string }) {
  const [method, setMethod] = useState<"pix" | "boleto">("pix");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<ChargeResult | null>(null);
  const [copied, setCopied] = useState(false);

  async function charge() {
    setBusy(true);
    setErr(null);
    setResult(null);
    try {
      const res = await fetch("/api/billing/pagarme/checkout", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId, method }),
      });
      if (!res.ok) {
        setErr(await readApiError(res, "Não foi possível gerar a cobrança."));
        return;
      }
      setResult((await res.json()) as ChargeResult);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <Select
          className="h-9 w-auto"
          value={method}
          onChange={(e) => setMethod(e.target.value as "pix" | "boleto")}
        >
          <option value="pix">Pix</option>
          <option value="boleto">Boleto</option>
        </Select>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => void charge()}
        >
          Cobrar online
        </Button>
      </div>

      {err ? <p className="text-xs text-red-600">{err}</p> : null}

      {result ? (
        <div className="mt-1 w-full max-w-sm rounded-md border border-border bg-muted/40 p-2 text-xs">
          <p className="font-medium">
            {method === "pix" ? "Pix gerado" : "Boleto gerado"} · {result.status}
          </p>
          {result.url ? (
            <a
              href={result.url}
              target="_blank"
              rel="noreferrer"
              className="text-primary hover:underline"
            >
              Abrir link de pagamento
            </a>
          ) : null}
          {result.pixQrCode ? (
            <div className="mt-1">
              <textarea
                readOnly
                value={result.pixQrCode}
                className="h-14 w-full resize-none rounded border border-input bg-background p-1 font-mono text-[10px]"
              />
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="mt-1 h-7"
                onClick={() => {
                  void navigator.clipboard.writeText(result.pixQrCode!);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
              >
                {copied ? "Copiado!" : "Copiar copia-e-cola"}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
