import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE_NAME } from "@/lib/auth/constants";
import { verifySessionToken } from "@/lib/auth/jwt";

const RESERVED = new Set(["www", "app", "api", "localhost"]);

export async function middleware(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  const slug = extractTenantSlug(host);
  const requestHeaders = new Headers(request.headers);
  if (slug) {
    requestHeaders.set("x-tenant-slug", slug);
  }

  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/admin")) {
    const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
    const secret = process.env.JWT_SECRET;
    if (!token || !secret || secret.length < 32) {
      const url = request.nextUrl.clone();
      url.pathname = "/login/plataforma";
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
    try {
      const session = await verifySessionToken(token, secret);
      if (session.typ !== "platform" || session.role !== "super_admin") {
        const url = request.nextUrl.clone();
        url.pathname = "/login/plataforma";
        url.searchParams.set("next", pathname);
        return NextResponse.redirect(url);
      }
    } catch {
      const url = request.nextUrl.clone();
      url.pathname = "/login/plataforma";
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
  }

  if (pathname.startsWith("/balcao")) {
    const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
    const secret = process.env.JWT_SECRET;
    if (!token || !secret || secret.length < 32) {
      return redirectToLogin(request, pathname);
    }
    try {
      const session = await verifySessionToken(token, secret);
      if (session.typ !== "tenant" || session.tid === null) {
        return redirectToLogin(request, pathname);
      }
    } catch {
      return redirectToLogin(request, pathname);
    }
  }

  return NextResponse.next({ request: { headers: requestHeaders } });
}

function redirectToLogin(request: NextRequest, pathname: string) {
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
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
