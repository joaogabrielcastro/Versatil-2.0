import { BalcaoNav } from "@/components/balcao/balcao-nav";
import { getSession } from "@/lib/auth/session";

export default async function BalcaoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  const isAdmin = session?.role === "tenant_admin";

  return (
    <div className="min-h-screen bg-background">
      <BalcaoNav isAdmin={isAdmin} />
      {children}
    </div>
  );
}
