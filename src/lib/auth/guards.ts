import { NextResponse } from "next/server";
import type { SessionPayload } from "@/lib/auth/types";
import { getSession } from "@/lib/auth/session";
import { jsonError } from "@/lib/api/json";

export type TenantSession = SessionPayload & { typ: "tenant"; tid: string };

export async function requireTenantSession(): Promise<
  TenantSession | NextResponse
> {
  const session = await getSession();
  if (!session || session.typ !== "tenant" || !session.tid) {
    return jsonError(401, "Não autenticado.");
  }
  return session as TenantSession;
}

export async function requireTenantAdmin(): Promise<
  TenantSession | NextResponse
> {
  const session = await requireTenantSession();
  if (session instanceof NextResponse) return session;
  if (session.role !== "tenant_admin") {
    return jsonError(403, "Apenas administrador da academia.");
  }
  return session;
}

export function isSessionError(
  value: TenantSession | NextResponse,
): value is NextResponse {
  return value instanceof NextResponse;
}
