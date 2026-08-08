"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  buildCardTokenPayload,
  extractTokenId,
  pagarmeTokensUrl,
  parseExpiry,
  validateCardInput,
} from "@/lib/payments/providers/pagarme/tokenize";

/**
 * Captura os dados do cartão e gera um token direto na API do Pagar.me usando a
 * chave pública. Os dados abertos do cartão NUNCA são enviados ao nosso servidor.
 * Ao concluir, chama `onToken(token)`.
 */
export function CardTokenizer({
  publicKey,
  disabled,
  onToken,
}: {
  publicKey: string;
  disabled?: boolean;
  onToken: (token: string) => void | Promise<void>;
}) {
  const [holder, setHolder] = useState("");
  const [number, setNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvv, setCvv] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setErr(null);
    const exp = parseExpiry(expiry);
    if (!exp) {
      setErr("Validade inválida. Use MM/AA.");
      return;
    }
    const card = {
      number,
      holderName: holder,
      expMonth: exp.expMonth,
      expYear: exp.expYear,
      cvv,
    };
    const invalid = validateCardInput(card);
    if (invalid) {
      setErr(invalid);
      return;
    }

    setBusy(true);
    try {
      const res = await fetch(pagarmeTokensUrl(publicKey), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildCardTokenPayload(card)),
      });
      const json = (await res.json().catch(() => null)) as unknown;
      if (!res.ok) {
        const message =
          (json as { message?: string } | null)?.message ??
          "Não foi possível validar o cartão.";
        setErr(message);
        return;
      }
      const token = extractTokenId(json);
      if (!token) {
        setErr("Resposta inesperada da tokenização.");
        return;
      }
      setNumber("");
      setCvv("");
      setExpiry("");
      setHolder("");
      await onToken(token);
    } catch {
      setErr("Falha de rede ao tokenizar o cartão.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <Input
        placeholder="Nome impresso no cartão"
        autoComplete="cc-name"
        value={holder}
        onChange={(e) => setHolder(e.target.value)}
      />
      <Input
        placeholder="Número do cartão"
        inputMode="numeric"
        autoComplete="cc-number"
        value={number}
        onChange={(e) => setNumber(e.target.value)}
      />
      <div className="flex gap-2">
        <Input
          placeholder="Validade MM/AA"
          inputMode="numeric"
          autoComplete="cc-exp"
          value={expiry}
          onChange={(e) => setExpiry(e.target.value)}
        />
        <Input
          placeholder="CVV"
          inputMode="numeric"
          autoComplete="cc-csc"
          value={cvv}
          onChange={(e) => setCvv(e.target.value)}
        />
      </div>
      {err ? <p className="text-xs text-red-600">{err}</p> : null}
      <Button
        type="button"
        size="sm"
        disabled={busy || disabled}
        onClick={() => void submit()}
      >
        {busy ? "Validando…" : "Salvar cartão"}
      </Button>
      <p className="text-[10px] text-muted-foreground">
        Os dados do cartão vão direto para o Pagar.me e não são armazenados no
        nosso servidor.
      </p>
    </div>
  );
}
