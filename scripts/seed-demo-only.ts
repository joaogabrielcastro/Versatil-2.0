/**
 * Só recarrega dados de demonstração (alunos, faturas, presença).
 * Uso: npx tsx scripts/seed-demo-only.ts
 * Nota: não apaga alunos existentes; pula se já houver ≥5 alunos.
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { tenants } from "../src/lib/db/schema";
import { withBypassRlsTransaction } from "../src/lib/db/with-tenant";
import { getEnv } from "../src/lib/env";
import { seedDemoData } from "./seed-demo";

async function main() {
  getEnv();
  if (process.env.NODE_ENV === "production" && process.env.SEED_DEMO_DATA !== "true") {
    console.error(
      "Dados de demonstração (alunos fictícios e token de catraca conhecido) não são criados em produção. Use SEED_DEMO_DATA=true só em ambiente de demonstração.",
    );
    process.exit(1);
  }
  const slug = process.env.SEED_TENANT_SLUG ?? "demo";
  const [tenant] = await withBypassRlsTransaction(async (tx) => {
    return tx
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.slug, slug))
      .limit(1);
  });
  if (!tenant) {
    console.error(`Tenant "${slug}" não encontrado. Rode npm run pilot:setup`);
    process.exit(1);
  }
  await seedDemoData(tenant.id);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
