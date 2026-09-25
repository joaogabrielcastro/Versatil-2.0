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

function hostnameFromHost(host: string): string {
  const trimmed = host.trim().toLowerCase();
  if (trimmed.startsWith("[")) {
    const end = trimmed.indexOf("]");
    return end > 1 ? trimmed.slice(1, end) : trimmed;
  }
  const ipv4 = trimmed.match(/^(\d{1,3}(?:\.\d{1,3}){3})(?::\d+)?$/);
  if (ipv4?.[1]) return ipv4[1];
  return trimmed.split(":")[0] ?? trimmed;
}

function isIpAddress(hostname: string): boolean {
  if (hostname.includes(":")) return true;
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname);
}

/** Extrai slug confiável apenas do Host (nunca de header do cliente). */
export function extractTenantSlugFromHost(
  host: string,
  appUrl?: string | null,
): string | null {
  const hostname = hostnameFromHost(host);
  if (isIpAddress(hostname) || hostname === "localhost") return null;
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
