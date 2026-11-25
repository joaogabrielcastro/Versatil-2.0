"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FlashMessage } from "@/components/ui/flash-message";
import { readApiError } from "@/lib/api/read-error";

const CONFIRMATION = "ANONIMIZAR";

/** Pedidos do titular (LGPD): cópia dos dados e eliminação. Só administrador. */
export function StudentPrivacyPanel({
  studentId,
  anonymized,
}: {
  studentId: string;
  anonymized: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function anonymize() {
    const typed = window.prompt(
      `Anonimizar remove nome, CPF, contatos, nascimento e treinos deste aluno de forma IRREVERSÍVEL. Faturas e presença ficam, sem identificação.\n\nDigite ${CONFIRMATION} para continuar:`,
    );
    if (typed?.trim() !== CONFIRMATION) return;
    const reason = window
      .prompt("Motivo (ex.: pedido do titular por e-mail em 25/11/2026). Não inclua dados pessoais:")
      ?.trim();
    if (!reason) return;
    setBusy(true);
    setErr(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/students/${studentId}/anonymize`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: CONFIRMATION, reason }),
      });
      if (!res.ok) {
        setErr(await readApiError(res, "Não foi possível anonimizar."));
        return;
      }
      setSuccess("Aluno anonimizado.");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 text-sm">
      <FlashMessage
        error={err}
        success={success}
        onDismiss={() => {
          setErr(null);
          setSuccess(null);
        }}
      />
      <p className="text-muted-foreground">
        Para atender pedidos do aluno (LGPD): exporte uma cópia dos dados ou anonimize o
        cadastro. Faturas e presença são mantidas por obrigação legal, sem identificação.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="secondary" size="sm">
          <a href={`/api/students/${studentId}/data-export`} download>
            Exportar dados (JSON)
          </a>
        </Button>
        {anonymized ? (
          <span className="self-center text-xs text-muted-foreground">
            Aluno já anonimizado.
          </span>
        ) : (
          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={busy}
            onClick={() => void anonymize()}
          >
            Anonimizar aluno
          </Button>
        )}
      </div>
    </div>
  );
}
