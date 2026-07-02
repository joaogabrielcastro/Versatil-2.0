/** Lê mensagem de erro de respostas JSON da API. */
export async function readApiError(
  res: Response,
  fallback = "Operação falhou. Tente novamente.",
): Promise<string> {
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  return data.error ?? fallback;
}
