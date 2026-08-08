"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { readApiError } from "@/lib/api/read-error";

/** Envia a fatura para pagamento na maquininha Stone (Connect). */
export function StoneChargeButton({ invoiceId }: { invoiceId: string }) {
  const [paymentType, setPaymentType] = useState<"credit" | "debit">("credit");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function charge() {
    setBusy(true);
    setErr(null);
    setSent(false);
    try {
      const res = await fetch("/api/billing/stone/charge", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId, paymentType }),
      });
      if (!res.ok) {
        setErr(await readApiError(res, "Não foi possível enviar à maquininha."));
        return;
      }
      setSent(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <Select
          className="h-9 w-auto"
          value={paymentType}
          onChange={(e) => setPaymentType(e.target.value as "credit" | "debit")}
        >
          <option value="credit">Crédito</option>
          <option value="debit">Débito</option>
        </Select>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => void charge()}
        >
          Cobrar na maquininha
        </Button>
      </div>
      {err ? <p className="text-xs text-red-600">{err}</p> : null}
      {sent ? (
        <p className="text-xs text-green-700">
          Enviado à maquininha. Conclua o pagamento no POS — a fatura é baixada
          automaticamente quando a Stone confirmar.
        </p>
      ) : null}
    </div>
  );
}
