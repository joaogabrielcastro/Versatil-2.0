import "dotenv/config";
import { and, eq } from "drizzle-orm";
import { hashPassword } from "../src/lib/auth/password";
import { platformAdmins, tenantUsers, tenants } from "../src/lib/db/schema";
import { withBypassRlsTransaction } from "../src/lib/db/with-tenant";
import { getEnv } from "../src/lib/env";

async function main() {
  getEnv();
  const tenantSlug = process.env.SEED_TENANT_SLUG ?? "demo";
  const tenantName = process.env.SEED_TENANT_NAME ?? "Academia Demo";
  const userEmail = (process.env.SEED_USER_EMAIL ?? "recep@demo.com").toLowerCase();
  const userPassword = process.env.SEED_USER_PASSWORD ?? "demo12345678";
  const platformEmail = (
    process.env.SEED_PLATFORM_EMAIL ?? "admin@plataforma.com"
  ).toLowerCase();
  const platformPassword =
    process.env.SEED_PLATFORM_PASSWORD ?? "demo12345678";

  await withBypassRlsTransaction(async (tx) => {
    const [existingTenant] = await tx
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.slug, tenantSlug))
      .limit(1);

    let tenantId = existingTenant?.id;
    if (!tenantId) {
      const [t] = await tx
        .insert(tenants)
        .values({ name: tenantName, slug: tenantSlug })
        .returning({ id: tenants.id });
      tenantId = t!.id;
      console.log(`Tenant criado: ${tenantSlug} (${tenantId})`);
    } else {
      console.log(`Tenant já existe: ${tenantSlug} (${tenantId})`);
    }

    const [existingUser] = await tx
      .select({ id: tenantUsers.id })
      .from(tenantUsers)
      .where(
        and(eq(tenantUsers.tenantId, tenantId), eq(tenantUsers.email, userEmail)),
      )
      .limit(1);

    if (!existingUser) {
      await tx.insert(tenantUsers).values({
        tenantId,
        email: userEmail,
        passwordHash: await hashPassword(userPassword),
        role: "tenant_admin",
      });
      console.log(`Usuário tenant criado: ${userEmail} (senha inicial no .env ou padrão)`);
    } else {
      console.log(`Usuário tenant já existe: ${userEmail}`);
    }

    const [existingAdmin] = await tx
      .select({ id: platformAdmins.id })
      .from(platformAdmins)
      .where(eq(platformAdmins.email, platformEmail))
      .limit(1);

    if (!existingAdmin) {
      await tx.insert(platformAdmins).values({
        email: platformEmail,
        passwordHash: await hashPassword(platformPassword),
      });
      console.log(`Super admin criado: ${platformEmail}`);
    } else {
      console.log(`Super admin já existe: ${platformEmail}`);
    }
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
