import "server-only";
import { headers } from "next/headers";
import { getTenantIdBySlug } from "@/lib/tenant/resolve";

export async function resolveKioskTenantId(
  tenantSlugParam?: string | null,
): Promise<{ tenantId: string; slug: string } | null> {
  const h = await headers();
  const slug = (tenantSlugParam?.trim() || h.get("x-tenant-slug") || "").toLowerCase();
  if (!slug) return null;

  const tenantId = await getTenantIdBySlug(slug);
  if (!tenantId) return null;

  return { tenantId, slug };
}
