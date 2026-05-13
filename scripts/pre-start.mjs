import "dotenv/config";
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
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("[pre-start] DATABASE_URL ausente.");
    process.exit(1);
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
  process.exit(1);
});
