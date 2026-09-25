/** CPF persistido e comparado apenas com dígitos. */

export function normalizeCpf(raw: string | null | undefined): string {
  return (raw ?? "").replace(/\D/g, "").slice(0, 11);
}

export function isNormalizedCpf(value: string): boolean {
  return /^\d{11}$/.test(value);
}

export function parseCpfInput(raw: string | null | undefined): string | null {
  const digits = normalizeCpf(raw);
  return isNormalizedCpf(digits) ? digits : null;
}

/** Mensagem do cadastro. Tamanho incorreto e demais falhas ficam separados. */
export function cpfRejectionMessage(raw: unknown): string | null {
  if (typeof raw !== "string") return "Informe um CPF válido";
  const digits = raw.replace(/\D/g, "");
  if (digits.length !== 11) return "Informe um CPF com 11 dígitos";
  if (!parseCpfInput(raw)) return "Informe um CPF válido";
  return null;
}

export function cpfsEqual(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const left = normalizeCpf(a);
  const right = normalizeCpf(b);
  return left.length === 11 && left === right;
}
