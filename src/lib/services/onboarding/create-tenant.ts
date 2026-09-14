import { hashPassword } from "@/lib/auth/password";
import { tenantUsers, tenants } from "@/lib/db/schema";
import { withBypassRlsTransaction } from "@/lib/db/with-tenant";

export type CreateTenantWithAdminInput = {
  name: string;
  slug: string;
  adminEmail: string;
  adminPassword: string;
};

export type CreatedTenantWithAdmin = {
  tenant: {
    id: string;
    name: string;
    slug: string;
    createdAt: Date;
  };
  admin: {
    id: string;
    email: string;
    role: "tenant_admin";
    tenantId: string;
  };
};

export async function createTenantWithAdmin(
  input: CreateTenantWithAdminInput,
): Promise<CreatedTenantWithAdmin> {
  const email = input.adminEmail.trim().toLowerCase();
  const passwordHash = await hashPassword(input.adminPassword);

  return withBypassRlsTransaction(async (tx) => {
    const [tenant] = await tx
      .insert(tenants)
      .values({ name: input.name, slug: input.slug })
      .returning({
        id: tenants.id,
        name: tenants.name,
        slug: tenants.slug,
        createdAt: tenants.createdAt,
      });
    if (!tenant) {
      throw new Error("tenant_insert_failed");
    }

    const [admin] = await tx
      .insert(tenantUsers)
      .values({
        tenantId: tenant.id,
        email,
        passwordHash,
        role: "tenant_admin",
      })
      .returning({
        id: tenantUsers.id,
        email: tenantUsers.email,
        role: tenantUsers.role,
        tenantId: tenantUsers.tenantId,
      });
    if (!admin) {
      throw new Error("admin_insert_failed");
    }

    return {
      tenant,
      admin: {
        id: admin.id,
        email: admin.email,
        role: "tenant_admin",
        tenantId: admin.tenantId,
      },
    };
  });
}
