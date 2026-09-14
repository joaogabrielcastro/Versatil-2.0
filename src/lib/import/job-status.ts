export function importJobFinalStatus(
  inserted: number,
  failed: number,
): "completed" | "failed" {
  if (inserted === 0 && failed > 0) return "failed";
  return "completed";
}
