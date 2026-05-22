import "dotenv/config";
import { and, count, eq } from "drizzle-orm";
import { hashPassword } from "../src/lib/auth/password";
import {
  platformAdmins,
  plans,
  tenantUsers,
  tenants,
  workoutTemplates,
} from "../src/lib/db/schema";
import { withBypassRlsTransaction } from "../src/lib/db/with-tenant";
import { getEnv } from "../src/lib/env";
import { DEFAULT_WORKOUT_PRESETS } from "../src/lib/workouts/presets";

async function main() {
  getEnv();
  const tenantSlug = process.env.SEED_TENANT_SLUG ?? "demo";
  const tenantName = process.env.SEED_TENANT_NAME ?? "Versátil Academia";
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

    const [{ n: planCount }] = await tx
      .select({ n: count() })
      .from(plans)
      .where(eq(plans.tenantId, tenantId));
    if (Number(planCount ?? 0) === 0) {
      await tx.insert(plans).values([
        {
          tenantId,
          name: "Mensal — piloto",
          priceCents: 9900,
          billingInterval: "monthly",
          active: true,
        },
        {
          tenantId,
          name: "Anual — piloto",
          priceCents: 99900,
          billingInterval: "yearly",
          active: true,
        },
      ]);
      console.log("Planos demo criados (Mensal / Anual).");
    } else {
      console.log(`Planos já existem no tenant (${planCount}), skip demo.`);
    }

    const [{ n: templateCount }] = await tx
      .select({ n: count() })
      .from(workoutTemplates)
      .where(eq(workoutTemplates.tenantId, tenantId));
    if (Number(templateCount ?? 0) === 0) {
      await tx.insert(workoutTemplates).values(
        DEFAULT_WORKOUT_PRESETS.map((p) => ({
          tenantId,
          name: p.name,
          description: p.description,
          exercises: p.exercises,
          isPreset: true,
          active: true,
          sortOrder: p.sortOrder,
        })),
      );
      console.log(
        `Modelos de treino pré-fixados criados (${DEFAULT_WORKOUT_PRESETS.length}).`,
      );
    } else {
      console.log(
        `Modelos de treino já existem no tenant (${templateCount}), skip presets.`,
      );
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
