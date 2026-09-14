/** Subdomínios do próprio app (não são academia). */
const RESERVED = new Set([
  "www",
  "app",
  "api",
  "localhost",
  "versatil",
  "versatil-academia",
]);

export const TRUSTED_TENANT_SLUG_HEADER = "x-tenant-slug";

export function appHostnameFromUrl(raw: string | undefined | null): string | null {
  if (!raw) return null;
  try {
    return new URL(raw).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** Extrai slug confiável apenas do Host (nunca de header do cliente). */
export function extractTenantSlugFromHost(
  host: string,
  appUrl?: string | null,
): string | null {
  const hostname = host.split(":")[0]?.toLowerCase() ?? "";
  const parts = hostname.split(".");
  if (parts.length < 3) return null;
  const sub = parts[0];
  if (!sub || RESERVED.has(sub)) return null;

  const appHost = appHostnameFromUrl(appUrl ?? null);
  if (appHost && hostname === appHost) return null;

  return sub;
}

/**
 * Remove qualquer `x-tenant-slug` enviado pelo cliente e, se o Host for
 * um subdomínio de academia, grava o valor confiável.
 */
export function trustedTenantHeaders(
  incoming: Headers,
  host: string,
  appUrl?: string | null,
): Headers {
  const headers = new Headers(incoming);
  headers.delete(TRUSTED_TENANT_SLUG_HEADER);
  const slug = extractTenantSlugFromHost(host, appUrl);
  if (slug) {
    headers.set(TRUSTED_TENANT_SLUG_HEADER, slug);
  }
  return headers;
}
