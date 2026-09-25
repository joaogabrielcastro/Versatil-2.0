/** IP do cliente. Este repositório não define um proxy, então X-Forwarded-For é ignorado. */
const BLOCKED_HEADERS = new Set(["x-forwarded-for", "forwarded"]);

export function clientIp(
  headers: Headers,
  headerName: string | undefined,
): string {
  const name = headerName?.trim().toLowerCase();
  if (!name || BLOCKED_HEADERS.has(name)) return "direct";
  const value = headers.get(name)?.trim();
  if (!value || value.includes(",") || value.length > 64) return "direct";
  return value;
}
