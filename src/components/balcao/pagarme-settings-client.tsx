"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Settings = {
  configured: boolean;
  enabled: boolean;
  hasSecretKey: boolean;
  hasWebhookSecret: boolean;
  publicKey: string | null;
};

async function fetchSettings() {
  const res = await fetch("/api/tenant/payment-providers/pagarme", {
    credentials: "include",
  });
  if (!res.ok) throw new Error("Falha ao carregar Pagar.me.");
  return (await res.json()) as Settings;
}

export function PagarmeSettingsClient({ appUrl }: { appUrl: string }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["pagarme-settings"], queryFn: fetchSettings });
  const [secretKey, setSecretKey] = useState("");
  const [publicKey, setPublicKey] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save(enabledOverride?: boolean) {
    setBusy(true);
    setMsg(null);
    try {
      const body: Record<string, string | boolean> = {};
      if (enabledOverride !== undefined) body.enabled = enabledOverride;
      if (secretKey) body.secretKey = secretKey;
      if (publicKey) body.publicKey = publicKey;
      if (webhookSecret) body.webhookSecret = webhookSecret;
      const res = await fetch("/api/tenant/payment-providers/pagarme", {
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
      setSecretKey("");
      setPublicKey("");
      setWebhookSecret("");
      setMsg("Guardado.");
      await qc.invalidateQueries({ queryKey: ["pagarme-settings"] });
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
  const webhookUrl = `${appUrl.replace(/\/$/, "")}/api/webhooks/pagarme?tenantSlug=SEU_SLUG`;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      className="max-w-lg space-y-4"
    >
      <div className="flex items-center gap-2 text-sm">
        <span
          className={`inline-block h-2 w-2 rounded-full ${
            s.enabled ? "bg-green-500" : "bg-gray-400"
          }`}
        />
        <span className="text-muted-foreground">
          {s.configured
            ? s.enabled
              ? "Ativo"
              : "Configurado (desativado)"
            : "Não configurado"}
          {s.hasSecretKey ? " · secret key definida" : ""}
          {s.hasWebhookSecret ? " · webhook secret definido" : ""}
        </span>
      </div>

      <div>
        <label className="text-sm font-medium">Secret key (sk_…)</label>
        <Input
          className="mt-1"
          type="password"
          autoComplete="off"
          placeholder={s.hasSecretKey ? "•••• (deixe vazio para manter)" : "sk_…"}
          value={secretKey}
          onChange={(e) => setSecretKey(e.target.value)}
        />
      </div>
      <div>
        <label className="text-sm font-medium">Public key (pk_…) — opcional</label>
        <Input
          className="mt-1"
          autoComplete="off"
          placeholder={s.publicKey ?? "pk_…"}
          value={publicKey}
          onChange={(e) => setPublicKey(e.target.value)}
        />
      </div>
      <div>
        <label className="text-sm font-medium">Webhook secret</label>
        <Input
          className="mt-1"
          type="password"
          autoComplete="off"
          placeholder={s.hasWebhookSecret ? "•••• (deixe vazio para manter)" : "segredo do webhook"}
          value={webhookSecret}
          onChange={(e) => setWebhookSecret(e.target.value)}
        />
        <p className="mt-1 text-xs text-muted-foreground">
          Configure no painel Pagar.me a URL de webhook:
          <br />
          <code className="break-all">{webhookUrl}</code>
        </p>
      </div>

      {msg ? (
        <p
          className={`text-sm ${
            msg.includes("Erro") ? "text-red-600" : "text-green-700"
          }`}
        >
          {msg}
        </p>
      ) : null}

      <div className="flex gap-2">
        <Button type="submit" disabled={busy}>
          Salvar
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => void save(!s.enabled)}
        >
          {s.enabled ? "Desativar" : "Ativar"}
        </Button>
      </div>
    </form>
  );
}
