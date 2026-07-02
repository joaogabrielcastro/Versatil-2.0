import { and, count, eq } from "drizzle-orm";
import type { DbTransaction } from "@/lib/db/with-tenant";
import { tenantUsers } from "@/lib/db/schema";

export async function countTenantAdmins(
  tx: DbTransaction,
  tenantId: string,
): Promise<number> {
  const [{ n }] = await tx
    .select({ n: count() })
    .from(tenantUsers)
    .where(
      and(
        eq(tenantUsers.tenantId, tenantId),
        eq(tenantUsers.role, "tenant_admin"),
      ),
    );
  return Number(n ?? 0);
}

export async function getTenantUser(
  tx: DbTransaction,
  tenantId: string,
  userId: string,
) {
  const [row] = await tx
    .select({
      id: tenantUsers.id,
      email: tenantUsers.email,
      role: tenantUsers.role,
      createdAt: tenantUsers.createdAt,
    })
    .from(tenantUsers)
    .where(and(eq(tenantUsers.tenantId, tenantId), eq(tenantUsers.id, userId)))
    .limit(1);
  return row ?? null;
}
