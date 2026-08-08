"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CardTokenizer } from "@/components/balcao/card-tokenizer";
import { readApiError } from "@/lib/api/read-error";

type Status = {
  autoRenew: boolean;
  hasCard: boolean;
  provider: string | null;
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

async function fetchPublicKey(): Promise<string | null> {
  const res = await fetch("/api/tenant/payment-providers/pagarme", {
    credentials: "include",
  });
  if (!res.ok) return null;
  const j = (await res.json()) as { publicKey: string | null; enabled: boolean };
  return j.enabled ? j.publicKey : null;
}

export function AutoRenewPanel({ studentId }: { studentId: string }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["auto-renew", studentId],
    queryFn: () => fetchStatus(studentId),
  });
  const pk = useQuery({
    queryKey: ["pagarme-public-key"],
    queryFn: fetchPublicKey,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function send(body: Record<string, unknown>) {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await fetch(`/api/students/${studentId}/auto-renew`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
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
  // Sem permissão (não-admin) ou erro silencioso: não renderiza a seção.
  if (q.isError || q.data == null) return null;

  const s = q.data;

  return (
    <div>
      <h3 className="text-sm font-medium">Renovação automática (Pagar.me)</h3>
      {!s.hasSubscription ? (
        <p className="mt-1 text-xs text-muted-foreground">
          Associe uma assinatura ativa para habilitar a renovação automática.
        </p>
      ) : (
        <div className="mt-2 space-y-2 text-sm">
          <p className="text-xs text-muted-foreground">
            Status:{" "}
            <span className={s.autoRenew ? "text-green-700" : "text-muted-foreground"}>
              {s.autoRenew ? "ativa" : "desativada"}
            </span>
            {s.hasCard ? " · cartão salvo" : " · sem cartão"}
          </p>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">
              {s.hasCard ? "Trocar cartão salvo" : "Cadastrar cartão"}
            </label>
            {pk.isLoading ? (
              <p className="text-xs text-muted-foreground">Carregando…</p>
            ) : pk.data ? (
              <CardTokenizer
                publicKey={pk.data}
                disabled={busy}
                onToken={(token) => send({ cardToken: token })}
              />
            ) : (
              <p className="text-xs text-amber-700">
                Configure a chave pública do Pagar.me em Configurações →
                Pagamentos para cadastrar cartões.
              </p>
            )}
          </div>

          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant={s.autoRenew ? "outline" : "default"}
              disabled={busy || (!s.hasCard && !s.autoRenew)}
              onClick={() => void send({ autoRenew: !s.autoRenew })}
            >
              {s.autoRenew ? "Desativar renovação" : "Ativar renovação"}
            </Button>
          </div>

          {err ? <p className="text-xs text-red-600">{err}</p> : null}
          {msg ? <p className="text-xs text-green-700">{msg}</p> : null}
        </div>
      )}
    </div>
  );
}
