"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Settings = {
  configured?: boolean;
  gateway: string | null;
  hasStripeSecret: boolean;
  hasAsaasKey: boolean;
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
  const [gateway, setGateway] = useState<"stripe" | "asaas">("stripe");
  const [stripeSecret, setStripeSecret] = useState("");
  const [stripeWebhook, setStripeWebhook] = useState("");
  const [asaasKey, setAsaasKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const body: Record<string, string> = { gateway };
      if (gateway === "stripe") {
        if (stripeSecret) body.stripeSecretKey = stripeSecret;
        if (stripeWebhook) body.stripeWebhookSecret = stripeWebhook;
      } else if (asaasKey) {
        body.asaasApiKey = asaasKey;
      }
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
      setAsaasKey("");
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
        Gateway atual:{" "}
        <span className="font-medium text-foreground">
          {s.gateway ?? "não definido"}
        </span>
        {s.hasStripeSecret ? " · Stripe (chave definida)" : null}
        {s.hasAsaasKey ? " · Asaas (chave definida)" : null}
      </p>

      <div>
        <label className="text-sm font-medium">Provedor</label>
        <select
          className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
          value={gateway}
          onChange={(e) => setGateway(e.target.value as "stripe" | "asaas")}
        >
          <option value="stripe">Stripe</option>
          <option value="asaas">Asaas</option>
        </select>
      </div>

      {gateway === "stripe" ? (
        <>
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
        </>
      ) : (
        <div>
          <label className="text-sm font-medium">Asaas API key</label>
          <Input
            className="mt-1"
            type="password"
            autoComplete="off"
            placeholder={s.hasAsaasKey ? "•••• (deixe vazio para manter)" : ""}
            value={asaasKey}
            onChange={(e) => setAsaasKey(e.target.value)}
          />
        </div>
      )}

      {msg ? (
        <p className={`text-sm ${msg.startsWith("Erro") || msg.includes("Erro") ? "text-red-600" : "text-green-700"}`}>
          {msg}
        </p>
      ) : null}

      <Button type="submit" disabled={busy}>
        Salvar
      </Button>
    </form>
  );
}
