/**
 * Datas recebidas pela API.
 *
 * "YYYY-MM-DD" sem hora é um dia civil da academia: vira meio-dia em São Paulo
 * (mesma convenção dos vencimentos). Sem isso, `new Date("2026-11-25")` é
 * meia-noite UTC = 21h do dia 24 em Brasília, e o vencimento cai um dia antes.
 * Datas com hora (ISO completo) são respeitadas como enviadas.
 */
export function parseApiDate(input: string): Date {
  const trimmed = input.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return new Date(`${trimmed}T12:00:00-03:00`);
  }
  return new Date(trimmed);
}
