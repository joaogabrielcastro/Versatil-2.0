"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Settings = {
  configured?: boolean;
  gateway: string | null;
  hasStripeSecret: boolean;
};

async function fetchSettings() {
  const res = await fetch("/api/tenant/payment-settings", {
    credentials: "include",
  });
  if (!res.ok) throw new Error("Falha ao carregar configurações.");
  return (await res.json()) as Settings;
}

export function PaymentSettingsClient() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["payment-settings"], queryFn: fetchSettings });
  const [stripeSecret, setStripeSecret] = useState("");
  const [stripeWebhook, setStripeWebhook] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const body: Record<string, string> = { gateway: "stripe" };
      if (stripeSecret) body.stripeSecretKey = stripeSecret;
      if (stripeWebhook) body.stripeWebhookSecret = stripeWebhook;
      const res = await fetch("/api/tenant/payment-settings", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setMsg(j.error ?? "Erro ao salvar.");
        return;
      }
      setStripeSecret("");
      setStripeWebhook("");
      setMsg("Guardado.");
      await qc.invalidateQueries({ queryKey: ["payment-settings"] });
    } finally {
      setBusy(false);
    }
  }

  if (q.isLoading) {
    return <p className="text-sm text-muted-foreground">Carregando…</p>;
  }
  if (q.isError) {
    return <p className="text-sm text-red-600">{(q.error as Error).message}</p>;
  }

  const s = q.data!;

  return (
    <form onSubmit={(e) => void save(e)} className="max-w-lg space-y-4">
      <p className="text-sm text-muted-foreground">
        Provedor: <span className="font-medium text-foreground">Stripe</span>
        {s.hasStripeSecret ? " · chave definida" : " · não configurado"}
      </p>

      <div>
        <label className="text-sm font-medium">Stripe secret key</label>
        <Input
          className="mt-1"
          type="password"
          autoComplete="off"
          placeholder={s.hasStripeSecret ? "•••• (deixe vazio para manter)" : "sk_live_…"}
          value={stripeSecret}
          onChange={(e) => setStripeSecret(e.target.value)}
        />
      </div>
      <div>
        <label className="text-sm font-medium">Stripe webhook secret</label>
        <Input
          className="mt-1"
          type="password"
          autoComplete="off"
          placeholder="whsec_…"
          value={stripeWebhook}
          onChange={(e) => setStripeWebhook(e.target.value)}
        />
      </div>

      {msg ? (
        <p className={`text-sm ${msg.includes("Erro") ? "text-red-600" : "text-green-700"}`}>
          {msg}
        </p>
      ) : null}

      <Button type="submit" disabled={busy}>
        Salvar
      </Button>
    </form>
  );
}
