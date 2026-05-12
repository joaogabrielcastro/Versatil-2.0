"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function ImportarPage() {
  const [file, setFile] = useState<File | null>(null);
  const [mappingJson, setMappingJson] = useState(
    '{"fullName":"nome","cpf":"cpf","email":"email"}',
  );
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setMsg("Selecione um CSV.");
      return;
    }
    setMsg(null);
    setLoading(true);
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("mapping", mappingJson);
      const res = await fetch("/api/import-jobs", {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        importJobId?: string;
        queuedRows?: number;
      };
      if (!res.ok) {
        setMsg(data.error ?? "Falha no envio.");
        return;
      }
      setMsg(
        `Importação enfileirada (${data.queuedRows} linhas). Job: ${data.importJobId}`,
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <Button variant="outline" size="sm" asChild>
        <Link href="/balcao">← Painel</Link>
      </Button>
      <h1 className="mt-6 text-2xl font-semibold tracking-tight">Importar CSV</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        O arquivo deve ter cabeçalho. Informe o JSON de mapeamento: chaves{" "}
        <code className="rounded bg-muted px-1">fullName</code>,{" "}
        <code className="rounded bg-muted px-1">cpf</code> (obrigatórios) e
        opcionalmente <code className="rounded bg-muted px-1">email</code>,{" "}
        <code className="rounded bg-muted px-1">whatsapp</code>,{" "}
        <code className="rounded bg-muted px-1">birthDate</code> com o nome da
        coluna no CSV.
      </p>
      <form onSubmit={(e) => void submit(e)} className="mt-6 flex flex-col gap-4">
        <Input
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <label className="text-sm">
          <span className="font-medium">Mapeamento (JSON)</span>
          <textarea
            className="mt-1 w-full rounded-md border border-border bg-transparent p-3 font-mono text-xs"
            rows={4}
            value={mappingJson}
            onChange={(e) => setMappingJson(e.target.value)}
          />
        </label>
        {msg ? <p className="text-sm text-muted-foreground">{msg}</p> : null}
        <Button type="submit" disabled={loading}>
          {loading ? "Enviando…" : "Enfileirar importação"}
        </Button>
      </form>
      <p className="mt-6 text-xs text-muted-foreground">
        Rode o worker: <code className="rounded bg-muted px-1">npm run worker</code>
      </p>
    </main>
  );
}
