import { eq } from "drizzle-orm";
import { BalcaoNav } from "@/components/balcao/balcao-nav";
import { getSession } from "@/lib/auth/session";
import { tenants } from "@/lib/db/schema";
import { withBypassRlsTransaction } from "@/lib/db/with-tenant";
import { getEnv } from "@/lib/env";

export default async function BalcaoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  const isAdmin = session?.role === "tenant_admin";
  const kioskToken = getEnv().KIOSK_ACCESS_SECRET ?? "";

  let tenantSlug = "demo";
  if (session?.typ === "tenant" && session.tid) {
    const row = await withBypassRlsTransaction(async (tx) => {
      const [t] = await tx
        .select({ slug: tenants.slug })
        .from(tenants)
        .where(eq(tenants.id, session.tid!))
        .limit(1);
      return t?.slug;
    });
    if (row) tenantSlug = row;
  }

  return (
    <div className="min-h-screen bg-background">
      <BalcaoNav
        isAdmin={isAdmin}
        tenantSlug={tenantSlug}
        kioskToken={kioskToken}
      />
      {children}
    </div>
  );
}
