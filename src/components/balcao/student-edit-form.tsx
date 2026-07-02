"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { BrDateInput } from "@/components/ui/br-date-input";
import { FlashMessage } from "@/components/ui/flash-message";
import { Input } from "@/components/ui/input";
import { readApiError } from "@/lib/api/read-error";
import { formatDateBr, parseDateBr } from "@/lib/dates/br";

type StudentEditFormProps = {
  studentId: string;
  initial: {
    fullName: string;
    email: string | null;
    whatsapp: string | null;
    birthDate: string | Date | null;
  };
};

export function StudentEditForm({ studentId, initial }: StudentEditFormProps) {
  const [fullName, setFullName] = useState(initial.fullName);
  const [email, setEmail] = useState(initial.email ?? "");
  const [whatsapp, setWhatsapp] = useState(initial.whatsapp ?? "");
  const [birthDate, setBirthDate] = useState(
    initial.birthDate ? formatDateBr(initial.birthDate) : "",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    let birthIso: string | null = null;
    if (birthDate.trim()) {
      const parsed = parseDateBr(birthDate);
      if (!parsed) {
        setError("Data de nascimento inválida. Use dd/mm/aaaa.");
        return;
      }
      birthIso = parsed.toISOString();
    }

    setBusy(true);
    try {
      const res = await fetch(`/api/students/${studentId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: fullName.trim(),
          email: email.trim() || "",
          whatsapp: whatsapp.trim() || null,
          birthDate: birthIso,
        }),
      });
      if (!res.ok) {
        setError(await readApiError(res, "Não foi possível salvar o aluno."));
        return;
      }
      setSuccess("Dados do aluno atualizados.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="space-y-3">
      <FlashMessage
        error={error}
        success={success}
        onDismiss={() => {
          setError(null);
          setSuccess(null);
        }}
      />
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Nome completo</span>
        <Input
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          required
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">E-mail</span>
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">WhatsApp</span>
        <Input
          value={whatsapp}
          onChange={(e) => setWhatsapp(e.target.value)}
          placeholder="(41) 99999-9999"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Data de nascimento</span>
        <BrDateInput value={birthDate} onChange={setBirthDate} />
      </label>
      <Button type="submit" size="sm" disabled={busy}>
        {busy ? "Salvando…" : "Salvar alterações"}
      </Button>
    </form>
  );
}
