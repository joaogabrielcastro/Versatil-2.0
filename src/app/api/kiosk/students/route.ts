import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api/json";
import { students } from "@/lib/db/schema";
import { withTenantTransaction } from "@/lib/db/with-tenant";
import { resolveKioskTenantId } from "@/lib/kiosk/resolve-tenant";

export const dynamic = "force-dynamic";

/** Lista de nomes para o terminal do aluno (sem login). */
export async function GET(request: Request) {
  const slug = new URL(request.url).searchParams.get("tenantSlug");
  const resolved = await resolveKioskTenantId(slug);
  if (!resolved) {
    return jsonError(
      400,
      "Informe tenantSlug (ex.: demo) ou acesse pelo subdomínio da academia.",
    );
  }

  const items = await withTenantTransaction(resolved.tenantId, async (tx) => {
    return tx
      .select({
        id: students.id,
        fullName: students.fullName,
      })
      .from(students)
      .where(eq(students.tenantId, resolved.tenantId))
      .orderBy(asc(students.fullName))
      .limit(2000);
  });

  return NextResponse.json({
    tenantSlug: resolved.slug,
    items,
    total: items.length,
  });
}
