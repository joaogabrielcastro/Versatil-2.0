/** Máximo de tentativas automáticas antes de desistir. */
export const MAX_CHARGE_ATTEMPTS = 4;

/** Backoff (em dias) por número de tentativas já realizadas. */
const BACKOFF_DAYS = [1, 3, 7];

/**
 * Próxima data de tentativa após uma falha. `attempts` é o total já tentado
 * (incluindo a que acabou de falhar). Retorna `null` quando esgotou.
 */
export function computeNextChargeAttempt(
  attempts: number,
  from: Date = new Date(),
): Date | null {
  if (attempts >= MAX_CHARGE_ATTEMPTS) return null;
  const idx = Math.min(attempts - 1, BACKOFF_DAYS.length - 1);
  const days = BACKOFF_DAYS[Math.max(0, idx)]!;
  return new Date(from.getTime() + days * 86_400_000);
}

/** Uma fatura é elegível para auto-cobrança agora? */
export function isChargeableNow(input: {
  status: string;
  chargeAttempts: number;
  nextChargeAttemptAt: Date | null;
  now?: Date;
}): boolean {
  if (input.status !== "open") return false;
  if (input.chargeAttempts >= MAX_CHARGE_ATTEMPTS) return false;
  const now = input.now ?? new Date();
  if (input.nextChargeAttemptAt && input.nextChargeAttemptAt.getTime() > now.getTime()) {
    return false;
  }
  return true;
}
