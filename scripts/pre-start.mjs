import path from "path";
import { fileURLToPath } from "url";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.join(__dirname, "..", "drizzle");

async function main() {
  if (process.env.SKIP_MIGRATIONS === "true") {
    console.log("[pre-start] SKIP_MIGRATIONS=true — migrações ignoradas.");
    return;
  }
  // Migrations precisam do login dono das tabelas. Em produção, DATABASE_URL é
  // o login de runtime (sem DDL); use MIGRATION_DATABASE_URL. Ver DEPLOY.md.
  const url = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) {
    console.error("[pre-start] MIGRATION_DATABASE_URL (ou DATABASE_URL) ausente.");
    process.exit(1);
  }
  if (!process.env.MIGRATION_DATABASE_URL) {
    console.warn(
      "[pre-start] MIGRATION_DATABASE_URL ausente; migrando com DATABASE_URL. Em produção, DATABASE_URL é o runtime e não tem permissão de DDL.",
    );
  }
  const client = postgres(url, { max: 1 });
  try {
    await migrate(drizzle(client), { migrationsFolder });
    console.log("[pre-start] Migrações aplicadas com sucesso.");
  } finally {
    await client.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error("[pre-start] Falha ao migrar:", err);
  const text = String(err?.cause?.message ?? err?.message ?? err);
  if (/permission denied|must be owner/i.test(text)) {
    console.error(
      "[pre-start] O login usado não pode alterar o schema. Defina MIGRATION_DATABASE_URL com o login dono das tabelas, ou SKIP_MIGRATIONS=true e rode as migrations em um passo separado.",
    );
  }
  process.exit(1);
});
