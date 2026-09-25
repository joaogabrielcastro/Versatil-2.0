"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { readApiError } from "@/lib/api/read-error";

type Status = {
  autoRenew: boolean;
  hasSubscription: boolean;
};

async function fetchStatus(studentId: string): Promise<Status | null> {
  const res = await fetch(`/api/students/${studentId}/auto-renew`, {
    credentials: "include",
  });
  if (res.status === 401 || res.status === 403) return null;
  if (!res.ok) throw new Error("Falha ao carregar renovação automática.");
  return (await res.json()) as Status;
}

export function AutoRenewPanel({ studentId }: { studentId: string }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["auto-renew", studentId],
    queryFn: () => fetchStatus(studentId),
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function send(autoRenew: boolean) {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await fetch(`/api/students/${studentId}/auto-renew`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autoRenew }),
      });
      if (!res.ok) {
        setErr(await readApiError(res, "Não foi possível atualizar."));
        return;
      }
      setMsg("Atualizado.");
      await qc.invalidateQueries({ queryKey: ["auto-renew", studentId] });
    } finally {
      setBusy(false);
    }
  }

  if (q.isLoading) return null;
  if (q.isError || q.data == null) return null;

  const s = q.data;

  return (
    <div>
      <h3 className="text-sm font-medium">Envio automático à maquininha</h3>
      {!s.hasSubscription ? (
        <p className="mt-1 text-xs text-muted-foreground">
          Associe uma assinatura ativa para habilitar o envio à maquininha.
        </p>
      ) : (
        <div className="mt-2 space-y-2 text-sm">
          <p className="text-xs text-muted-foreground">
            Status:{" "}
            <span className={s.autoRenew ? "text-green-700" : "text-muted-foreground"}>
              {s.autoRenew ? "ativa" : "desativada"}
            </span>
            . Envia a fatura em aberto ao POS. Não renova o contrato nem repete cobrança com resultado desconhecido.
          </p>
          <Button
            type="button"
            size="sm"
            variant={s.autoRenew ? "outline" : "default"}
            disabled={busy}
            onClick={() => void send(!s.autoRenew)}
          >
            {s.autoRenew ? "Desativar envio ao POS" : "Ativar envio ao POS"}
          </Button>
          {err ? <p className="text-xs text-red-600">{err}</p> : null}
          {msg ? <p className="text-xs text-green-700">{msg}</p> : null}
        </div>
      )}
    </div>
  );
}
