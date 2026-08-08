"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

type Settings = {
  configured: boolean;
  enabled: boolean;
  hasSecretKey: boolean;
  serviceRefererName: string | null;
  defaultTerminalSerial: string | null;
  paymentType: "credit" | "debit";
};

async function fetchSettings() {
  const res = await fetch("/api/tenant/payment-providers/stone", {
    credentials: "include",
  });
  if (!res.ok) throw new Error("Falha ao carregar Stone Connect.");
  return (await res.json()) as Settings;
}

export function StoneSettingsClient() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["stone-settings"], queryFn: fetchSettings });
  const [secretKey, setSecretKey] = useState("");
  const [refererName, setRefererName] = useState("");
  const [serial, setSerial] = useState("");
  const [paymentType, setPaymentType] = useState<"credit" | "debit">("credit");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save(enabledOverride?: boolean) {
    setBusy(true);
    setMsg(null);
    try {
      const body: Record<string, string | boolean> = { paymentType };
      if (enabledOverride !== undefined) body.enabled = enabledOverride;
      if (secretKey) body.secretKey = secretKey;
      if (refererName) body.serviceRefererName = refererName;
      if (serial) body.defaultTerminalSerial = serial;
      const res = await fetch("/api/tenant/payment-providers/stone", {
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
      setRefererName("");
      setSerial("");
      setMsg("Guardado.");
      await qc.invalidateQueries({ queryKey: ["stone-settings"] });
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
        </span>
      </div>

      <div>
        <label className="text-sm font-medium">Secret key (conta Pagar.me/Stone)</label>
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
        <label className="text-sm font-medium">ServiceRefererName (Stone Partner)</label>
        <Input
          className="mt-1"
          autoComplete="off"
          placeholder={s.serviceRefererName ?? "ID da parceria Stone"}
          value={refererName}
          onChange={(e) => setRefererName(e.target.value)}
        />
      </div>
      <div className="flex gap-3">
        <div className="flex-1">
          <label className="text-sm font-medium">Serial padrão do POS</label>
          <Input
            className="mt-1"
            autoComplete="off"
            placeholder={s.defaultTerminalSerial ?? "ex.: 6N021234"}
            value={serial}
            onChange={(e) => setSerial(e.target.value)}
          />
        </div>
        <div>
          <label className="text-sm font-medium">Padrão</label>
          <Select
            className="mt-1 h-9"
            value={paymentType}
            onChange={(e) => setPaymentType(e.target.value as "credit" | "debit")}
          >
            <option value="credit">Crédito</option>
            <option value="debit">Débito</option>
          </Select>
        </div>
      </div>

      {msg ? (
        <p className={`text-sm ${msg.includes("Erro") ? "text-red-600" : "text-green-700"}`}>
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
