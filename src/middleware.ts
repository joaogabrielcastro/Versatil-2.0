import { NextResponse, type NextRequest } from "next/server";

const RESERVED = new Set(["www", "app", "api", "localhost"]);

/**
 * Propaga identificação do tenant por subdomínio para Server Components / rotas.
 * Ex.: acme.localhost:3000 → header `x-tenant-slug: acme`
 */
export function middleware(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  const slug = extractTenantSlug(host);
  const requestHeaders = new Headers(request.headers);
  if (slug) {
    requestHeaders.set("x-tenant-slug", slug);
  }
  return NextResponse.next({ request: { headers: requestHeaders } });
}

function extractTenantSlug(host: string): string | null {
  const hostname = host.split(":")[0]?.toLowerCase() ?? "";
  const parts = hostname.split(".");
  if (parts.length < 2) return null;
  const sub = parts[0];
  if (!sub || RESERVED.has(sub)) return null;
  return sub;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
