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
import { seedDemoData } from "./seed-demo";

const DEMO_PASSWORD = "demo12345678";

/**
 * Em produção: senhas obrigatórias (≥ 12, diferentes da senha de demonstração)
 * e nenhum dado fictício, a menos que SEED_DEMO_DATA=true (ambiente de demo).
 */
function seedConfig() {
  const production = process.env.NODE_ENV === "production";
  const demoData = production ? process.env.SEED_DEMO_DATA === "true" : true;
  const userPassword = process.env.SEED_USER_PASSWORD ?? (production ? "" : DEMO_PASSWORD);
  const platformPassword =
    process.env.SEED_PLATFORM_PASSWORD ?? (production ? "" : DEMO_PASSWORD);
  if (production) {
    for (const [name, value] of [
      ["SEED_USER_PASSWORD", userPassword],
      ["SEED_PLATFORM_PASSWORD", platformPassword],
    ] as const) {
      if (value.length < 12 || value === DEMO_PASSWORD) {
        throw new Error(
          `${name} é obrigatória em produção (mínimo 12 caracteres, diferente da senha de demonstração).`,
        );
      }
    }
  }
  return { userPassword, platformPassword, demoData };
}

async function main() {
  getEnv();
  const { userPassword, platformPassword, demoData } = seedConfig();
  const tenantSlug = process.env.SEED_TENANT_SLUG ?? "demo";
  const tenantName = process.env.SEED_TENANT_NAME ?? "Versátil Academia";
  const userEmail = (process.env.SEED_USER_EMAIL ?? "recep@demo.com").toLowerCase();
  const platformEmail = (
    process.env.SEED_PLATFORM_EMAIL ?? "admin@plataforma.com"
  ).toLowerCase();

  const tenantId = await withBypassRlsTransaction(async (tx) => {
    const [existingTenant] = await tx
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.slug, tenantSlug))
      .limit(1);

    let id = existingTenant?.id;
    if (!id) {
      const [t] = await tx
        .insert(tenants)
        .values({ name: tenantName, slug: tenantSlug })
        .returning({ id: tenants.id });
      id = t!.id;
      console.log(`Tenant criado: ${tenantSlug} (${id})`);
    } else {
      console.log(`Tenant já existe: ${tenantSlug} (${id})`);
    }

    const [existingUser] = await tx
      .select({ id: tenantUsers.id })
      .from(tenantUsers)
      .where(
        and(eq(tenantUsers.tenantId, id), eq(tenantUsers.email, userEmail)),
      )
      .limit(1);

    if (!existingUser) {
      await tx.insert(tenantUsers).values({
        tenantId: id,
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
      .where(eq(plans.tenantId, id));
    if (Number(planCount ?? 0) === 0) {
      await tx.insert(plans).values([
        {
          tenantId: id,
          name: "Mensal",
          priceCents: 12900,
          billingInterval: "monthly",
          active: true,
        },
        {
          tenantId: id,
          name: "Anual",
          priceCents: 129000,
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
      .where(eq(workoutTemplates.tenantId, id));
    if (Number(templateCount ?? 0) === 0) {
      await tx.insert(workoutTemplates).values(
        DEFAULT_WORKOUT_PRESETS.map((p) => ({
          tenantId: id,
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

    return id;
  });

  // Após commit — seedDemoData abre transações próprias e precisa ver planos já gravados
  if (demoData) {
    await seedDemoData(tenantId);
  } else {
    console.log("Produção: dados de demonstração não foram criados (SEED_DEMO_DATA=true para criar).");
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
