import { WorkoutPrintKiosk } from "@/components/kiosk/workout-print-kiosk";
import { getTenantSlugFromRequest } from "@/lib/tenant/request-slug";

export const dynamic = "force-dynamic";

export default async function ImprimirTreinoPage({
  searchParams,
}: {
  searchParams: Promise<{ slug?: string; token?: string; kioskToken?: string }>;
}) {
  const sp = await searchParams;
  const fromHost = await getTenantSlugFromRequest();
  const initialSlug = (sp.slug ?? fromHost ?? "demo").trim();
  const initialToken = (sp.token ?? sp.kioskToken ?? "").trim();

  return (
    <div className="min-h-screen bg-background">
      <WorkoutPrintKiosk
        initialSlug={initialSlug}
        slugFromSubdomain={Boolean(fromHost)}
        initialToken={initialToken}
      />
    </div>
  );
}
