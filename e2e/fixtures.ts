/** Academias e usuários criados pelo global-setup (ambiente de teste). */
export const PASSWORD = "senha-e2e-segura-123";
export const TENANT_A = { slug: "e2e-a", admin: "admin@e2e-a.test" };
export const TENANT_B = { slug: "e2e-b", admin: "admin@e2e-b.test" };

/** CPF válido a partir de 9 dígitos (dígitos verificadores calculados). */
export function validCpf(seed: number): string {
  const n = String(seed).padStart(9, "0").slice(-9).split("").map(Number);
  const dv = (digits: number[]) =>
    ((digits.reduce((s, v, i) => s + v * (digits.length + 1 - i), 0) * 10) % 11) % 10;
  const d1 = dv(n);
  const d2 = dv([...n, d1]);
  return [...n, d1, d2].join("");
}
