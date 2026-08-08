import { and, asc, eq, ilike } from "drizzle-orm";
import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api/json";
import { students } from "@/lib/db/schema";
import { withTenantTransaction } from "@/lib/db/with-tenant";
import {
  assertKioskAccess,
  KIOSK_SEARCH_MAX_RESULTS,
  KIOSK_SEARCH_MIN_CHARS,
  sanitizeKioskSearchQuery,
} from "@/lib/kiosk/access";
import { resolveKioskTenantId } from "@/lib/kiosk/resolve-tenant";

export const dynamic = "force-dynamic";

/**
 * Busca nomes no terminal (sem listar a academia inteira).
 * Requer `q` com pelo menos 2 caracteres + token do terminal (ou sessão balcão).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const slug = url.searchParams.get("tenantSlug");
  const resolved = await resolveKioskTenantId(slug);
  if (!resolved) {
    return jsonError(
      400,
      "Informe tenantSlug (ex.: demo) ou acesse pelo subdomínio da academia.",
    );
  }

  const denied = await assertKioskAccess(request, resolved.tenantId);
  if (denied) return denied;

  const q = sanitizeKioskSearchQuery(url.searchParams.get("q") ?? "");
  if (q.length < KIOSK_SEARCH_MIN_CHARS) {
    return jsonError(
      400,
      `Digite ao menos ${KIOSK_SEARCH_MIN_CHARS} caracteres do nome para buscar.`,
    );
  }

  const limitRaw = Number(url.searchParams.get("limit") ?? KIOSK_SEARCH_MAX_RESULTS);
  const limit = Math.min(
    Math.max(1, Number.isFinite(limitRaw) ? Math.floor(limitRaw) : KIOSK_SEARCH_MAX_RESULTS),
    KIOSK_SEARCH_MAX_RESULTS,
  );

  const items = await withTenantTransaction(resolved.tenantId, async (tx) => {
    return tx
      .select({
        id: students.id,
        fullName: students.fullName,
      })
      .from(students)
      .where(
        and(
          eq(students.tenantId, resolved.tenantId),
          ilike(students.fullName, `%${q}%`),
        ),
      )
      .orderBy(asc(students.fullName))
      .limit(limit);
  });

  return NextResponse.json({
    tenantSlug: resolved.slug,
    q,
    items,
    total: items.length,
    truncated: items.length >= limit,
  });
}
