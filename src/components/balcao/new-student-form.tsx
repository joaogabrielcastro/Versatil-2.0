"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Props = {
  onCreated: () => void;
};

export function NewStudentForm({ onCreated }: Props) {
  const [fullName, setFullName] = useState("");
  const [cpf, setCpf] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setLoading(true);
    try {
      const res = await fetch("/api/students", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: fullName.trim(),
          cpf: cpf.trim(),
          email: email.trim() || undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setMsg(data.error ?? "Erro ao criar.");
        return;
      }
      setFullName("");
      setCpf("");
      setEmail("");
      onCreated();
      setMsg("Aluno criado.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-3">
      <Input
        placeholder="Nome completo"
        value={fullName}
        onChange={(e) => setFullName(e.target.value)}
        required
      />
      <Input placeholder="CPF" value={cpf} onChange={(e) => setCpf(e.target.value)} required />
      <Input
        type="email"
        placeholder="E-mail (opcional)"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      {msg ? <p className="text-sm text-muted-foreground">{msg}</p> : null}
      <Button type="submit" disabled={loading}>
        {loading ? "Salvando…" : "Cadastrar"}
      </Button>
    </form>
  );
}
