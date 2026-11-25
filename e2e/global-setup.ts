import { spawnSync } from "node:child_process";
import { PASSWORD, TENANT_A, TENANT_B } from "./fixtures";

/** Cria (idempotente) duas academias de teste com admin conhecido e planos demo. */
export default async function globalSetup() {
  const seedUrl = process.env.E2E_SEED_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!seedUrl) {
    throw new Error("Defina E2E_SEED_DATABASE_URL (login dono das tabelas) para criar as academias de teste.");
  }
  for (const t of [TENANT_A, TENANT_B]) {
    const r = spawnSync("npx", ["tsx", "scripts/seed.ts"], {
      encoding: "utf8",
      env: {
        ...process.env,
        NODE_ENV: "development",
        DATABASE_URL: seedUrl,
        PLATFORM_DATABASE_URL: seedUrl,
        SEED_TENANT_SLUG: t.slug,
        SEED_TENANT_NAME: `Academia ${t.slug.toUpperCase()}`,
        SEED_USER_EMAIL: t.admin,
        SEED_USER_PASSWORD: PASSWORD,
        SEED_PLATFORM_EMAIL: "plataforma@e2e.test",
        SEED_PLATFORM_PASSWORD: PASSWORD,
      },
    });
    if (r.status !== 0) {
      throw new Error(`Seed de ${t.slug} falhou:\n${r.stderr || r.stdout}`);
    }
  }
}
