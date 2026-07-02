import { LoginForm } from "@/components/auth/login-form";
import { getTenantSlugFromRequest } from "@/lib/tenant/request-slug";

type PageProps = {
  searchParams: Promise<{ demo?: string; next?: string; slug?: string }>;
};

export default async function LoginPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const subdomainSlug = await getTenantSlugFromRequest();
  const querySlug = params.slug?.trim() || undefined;

  return (
    <LoginForm subdomainSlug={subdomainSlug} initialSlug={querySlug} />
  );
}
