import { headers } from "next/headers";
import { cache } from "react";

/** Resolve slug do tenant a partir do middleware (subdomínio). */
export const getTenantSlugFromRequest = cache(async (): Promise<string | null> => {
  const h = await headers();
  return h.get("x-tenant-slug");
});
