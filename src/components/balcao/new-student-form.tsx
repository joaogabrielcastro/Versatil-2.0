"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FlashMessage } from "@/components/ui/flash-message";
import { Input } from "@/components/ui/input";
import { readApiError } from "@/lib/api/read-error";

type Props = {
  onCreated: () => void;
};

export function NewStudentForm({ onCreated }: Props) {
  const [fullName, setFullName] = useState("");
  const [cpf, setCpf] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
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
      if (!res.ok) {
        setError(await readApiError(res, "Não foi possível cadastrar o aluno."));
        return;
      }
      setFullName("");
      setCpf("");
      setEmail("");
      onCreated();
      setSuccess("Aluno cadastrado com sucesso.");
    } catch {
      setError("Erro de rede ou servidor indisponível.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-3">
      <FlashMessage
        error={error}
        success={success}
        onDismiss={() => {
          setError(null);
          setSuccess(null);
        }}
      />
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
      <Button type="submit" disabled={loading}>
        {loading ? "Salvando…" : "Cadastrar"}
      </Button>
    </form>
  );
}
