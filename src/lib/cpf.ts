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

/** Dígitos verificadores (módulo 11). Sequências repetidas são inválidas. */
export function isValidCpf(digits: string): boolean {
  if (!isNormalizedCpf(digits) || /^(\d)\1{10}$/.test(digits)) return false;
  const nums = digits.split("").map(Number);
  const check = (len: number) => {
    const sum = nums.slice(0, len).reduce((acc, n, i) => acc + n * (len + 1 - i), 0);
    return ((sum * 10) % 11) % 10;
  };
  return check(9) === nums[9] && check(10) === nums[10];
}

/**
 * Mensagem do cadastro manual. Tamanho incorreto e demais falhas ficam separados.
 * A importação em massa usa só parseCpfInput (dados legados podem ter erro de digitação).
 */
export function cpfRejectionMessage(raw: unknown): string | null {
  if (typeof raw !== "string") return "Informe um CPF válido";
  const digits = raw.replace(/\D/g, "");
  if (digits.length !== 11) return "Informe um CPF com 11 dígitos";
  if (!parseCpfInput(raw) || !isValidCpf(digits)) return "Informe um CPF válido";
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
