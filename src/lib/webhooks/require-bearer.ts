export function requireConfiguredBearer(
  secret: string | undefined,
  authorization: string | null,
  missingMessage: string,
): { ok: true } | { ok: false; status: 401 | 503; error: string } {
  if (!secret) {
    return { ok: false, status: 503, error: missingMessage };
  }
  if (authorization !== `Bearer ${secret}`) {
    return { ok: false, status: 401, error: "Não autorizado." };
  }
  return { ok: true };
}
