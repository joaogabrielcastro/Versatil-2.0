/** Referência externa do aluno (ex.: código Tecnofit usado pela catraca). */

export function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

/** Grava no campo facialVectorRef: tecnofit:76126 */
export function tecnofitCodeRef(codigo: string): string {
  const raw = codigo.trim();
  const digits = onlyDigits(raw);
  return `tecnofit:${digits || raw}`;
}

export function parseTecnofitCodeRef(ref: string | null | undefined): string | null {
  if (!ref) return null;
  const m = /^tecnofit:(.+)$/i.exec(ref.trim());
  return m?.[1] ?? null;
}
