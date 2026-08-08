/**
 * Tokenização de cartão no navegador (PCI-safe): os dados abertos do cartão vão
 * direto para a API do Pagar.me usando a chave pública (`appId`) e nunca passam
 * pelo nosso servidor. O token retornado (válido por 60s, uso único) é enviado
 * ao backend para virar um cartão salvo.
 */

export const PAGARME_TOKENS_BASE = "https://api.pagar.me/core/v5/tokens";

export function pagarmeTokensUrl(publicKey: string): string {
  return `${PAGARME_TOKENS_BASE}?appId=${encodeURIComponent(publicKey)}`;
}

export interface CardTokenInput {
  number: string;
  holderName: string;
  expMonth: number;
  expYear: number;
  cvv: string;
}

export function sanitizeDigits(v: string): string {
  return v.replace(/\D/g, "");
}

/** Aceita "MM/AA", "MM/AAAA", "MMAA", "MM AAAA". Retorna mês/ano (4 dígitos). */
export function parseExpiry(
  raw: string,
): { expMonth: number; expYear: number } | null {
  const digits = sanitizeDigits(raw);
  if (digits.length !== 4 && digits.length !== 6) return null;
  const month = Number(digits.slice(0, 2));
  const yearPart = digits.slice(2);
  if (!Number.isInteger(month) || month < 1 || month > 12) return null;
  let year = Number(yearPart);
  if (yearPart.length === 2) year += 2000;
  if (year < 2000 || year > 2100) return null;
  return { expMonth: month, expYear: year };
}

export function buildCardTokenPayload(
  card: CardTokenInput,
): Record<string, unknown> {
  return {
    type: "card",
    card: {
      number: sanitizeDigits(card.number),
      holder_name: card.holderName.trim(),
      exp_month: card.expMonth,
      exp_year: card.expYear,
      cvv: sanitizeDigits(card.cvv),
    },
  };
}

/** Extrai o id do token da resposta da API. */
export function extractTokenId(json: unknown): string | null {
  if (!json || typeof json !== "object") return null;
  const id = (json as { id?: unknown }).id;
  return typeof id === "string" && id.startsWith("token_") ? id : null;
}

/** Validação leve antes de enviar (evita round-trip com dados obviamente inválidos). */
export function validateCardInput(card: CardTokenInput): string | null {
  const number = sanitizeDigits(card.number);
  if (number.length < 13 || number.length > 19) return "Número do cartão inválido.";
  if (card.holderName.trim().length < 2) return "Informe o nome do titular.";
  if (card.expMonth < 1 || card.expMonth > 12) return "Validade inválida.";
  const cvv = sanitizeDigits(card.cvv);
  if (cvv.length < 3 || cvv.length > 4) return "CVV inválido.";
  return null;
}
