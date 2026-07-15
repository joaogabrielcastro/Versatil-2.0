"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FlashMessage } from "@/components/ui/flash-message";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
    <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-4">
      <FlashMessage
        error={error}
        success={success}
        onDismiss={() => {
          setError(null);
          setSuccess(null);
        }}
      />
      <div className="space-y-1.5">
        <Label htmlFor="new-student-name">Nome completo</Label>
        <Input
          id="new-student-name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          required
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="new-student-cpf">CPF</Label>
        <Input
          id="new-student-cpf"
          value={cpf}
          onChange={(e) => setCpf(e.target.value)}
          placeholder="000.000.000-00"
          required
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="new-student-email">E-mail (opcional)</Label>
        <Input
          id="new-student-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <Button type="submit" disabled={loading} className="w-full">
        {loading ? "Salvando…" : "Cadastrar aluno"}
      </Button>
    </form>
  );
}
