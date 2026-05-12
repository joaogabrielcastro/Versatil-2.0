import { eq } from "drizzle-orm";
import { cache } from "react";
import { withBypassRlsTransaction } from "@/lib/db/with-tenant";
import { tenants } from "@/lib/db/schema";

/** Resolve tenant por slug (subdomínio). Usa transação com bypass RLS — apenas em código servidor confiável. */
export const getTenantIdBySlug = cache(async (slug: string) => {
  return withBypassRlsTransaction(async (tx) => {
    const [row] = await tx
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.slug, slug))
      .limit(1);
    return row?.id ?? null;
  });
});
