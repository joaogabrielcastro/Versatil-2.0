import { NextResponse } from "next/server";
import { logAudit } from "@/lib/audit/log";
import { jsonError } from "@/lib/api/json";
import { getSession } from "@/lib/auth/session";
import { seedVersatilCatalog } from "@/lib/catalog/seed-versatil";
import { withTenantTransaction } from "@/lib/db/with-tenant";

export const dynamic = "force-dynamic";

export async function POST() {
  const session = await getSession();
  if (!session || session.typ !== "tenant" || !session.tid) {
    return jsonError(401, "Não autenticado.");
  }
  if (session.role !== "tenant_admin") {
    return jsonError(403, "Apenas administrador da academia.");
  }
  const tenantId = session.tid;

  const result = await withTenantTransaction(tenantId, (tx) =>
    seedVersatilCatalog(tx, tenantId),
  );

  await logAudit({
    tenantId,
    actorUserId: session.sub,
    action: "catalog.versatil_loaded",
    entity: "plan",
    payload: result,
  });

  return NextResponse.json(result);
}
