"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDateTimeBr } from "@/lib/dates/br";

type Device = {
  id: string;
  name: string;
  lastSeenAt: string | null;
  createdAt: string;
};

async function fetchDevices() {
  const res = await fetch("/api/turnstile/devices", { credentials: "include" });
  if (!res.ok) throw new Error("Falha ao carregar dispositivos.");
  return (await res.json()) as { items: Device[] };
}

export function IntegracoesClient({ appUrl }: { appUrl: string }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["turnstile-devices"], queryFn: fetchDevices });
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function createDevice(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    setNewToken(null);
    try {
      const res = await fetch("/api/turnstile/devices", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        error?: string;
        deviceToken?: string;
      };
      if (!res.ok) {
        setErr(j.error ?? "Erro ao criar dispositivo.");
        return;
      }
      setNewToken(j.deviceToken ?? null);
      setName("");
      await qc.invalidateQueries({ queryKey: ["turnstile-devices"] });
    } finally {
      setBusy(false);
    }
  }

  const base = appUrl.replace(/\/$/, "");

  return (
    <div className="grid gap-10 lg:grid-cols-2">
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Catraca (API)</h2>
        <p className="text-sm text-muted-foreground">
          O equipamento ou gateway local chama esta URL após reconhecer o rosto do
          aluno. O sistema responde se a catraca deve abrir.
        </p>
        <pre className="overflow-x-auto rounded-md border border-border bg-muted/40 p-3 text-xs">
{`POST ${base}/api/turnstile/v1/access
Header: x-tenant-device-token: <token do dispositivo>
Body: { "studentId": "<uuid do aluno>" }

200 → { "open": true }
403 → { "open": false, "message": "Aluno inadimplente." }`}
        </pre>
        <p className="text-xs text-muted-foreground">
          O <code className="text-foreground">studentId</code> é o UUID do aluno no
          Versátil (ficha do aluno na URL).
        </p>

        <h3 className="text-sm font-medium">Dispositivos cadastrados</h3>
        {q.isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : q.isError ? (
          <p className="text-sm text-red-600">{(q.error as Error).message}</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {(q.data?.items ?? []).length === 0 ? (
              <li className="text-muted-foreground">Nenhum dispositivo.</li>
            ) : (
              q.data!.items.map((d) => (
                <li key={d.id} className="rounded-md border border-border p-2">
                  <div className="font-medium">{d.name}</div>
                  <div className="text-xs text-muted-foreground">
                    ID {d.id.slice(0, 8)}… · Criado{" "}
                    {formatDateTimeBr(d.createdAt)}
                  </div>
                </li>
              ))
            )}
          </ul>
        )}

        <form onSubmit={(e) => void createDevice(e)} className="flex flex-col gap-2">
          <Input
            placeholder="Nome (ex.: Catraca entrada principal)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <Button type="submit" size="sm" disabled={busy}>
            Novo dispositivo (gera token)
          </Button>
        </form>
        {newToken ? (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
            <p className="font-medium">Token (copie agora — não será exibido de novo):</p>
            <code className="mt-1 block break-all text-xs">{newToken}</code>
          </div>
        ) : null}
        {err ? <p className="text-sm text-red-600">{err}</p> : null}
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Stone (webhook — Fase 2)</h2>
        <p className="text-sm text-muted-foreground">
          Quando tiver acesso à Stone, configure o webhook para baixar faturas
          automaticamente. Hoje use o balcão para registrar pagamentos manualmente.
        </p>
        <pre className="overflow-x-auto rounded-md border border-border bg-muted/40 p-3 text-xs">
{`POST ${base}/api/webhooks/stone
Header: Authorization: Bearer <STONE_WEBHOOK_SECRET>
Body: {
  "tenantId": "<uuid da academia>",
  "eventId": "id-unico-stone",
  "type": "invoice.paid",
  "invoiceId": "<uuid da fatura>",
  "stoneChargeId": "opcional",
  "raw": { }
}`}
        </pre>
        <p className="text-xs text-muted-foreground">
          Evento <code className="text-foreground">invoice.payment_failed</code> marca
          a fatura como incobrável e o aluno pode ficar inadimplente.
        </p>
        <p className="text-xs text-muted-foreground">
          Documentação completa: <strong>INTEGRACOES.md</strong> na raiz do projeto.
        </p>
      </section>
    </div>
  );
}
