import { readFileSync } from "node:fs";
import path from "node:path";

process.env.JWT_SECRET ??= "01234567890123456789012345678901";
process.env.NEXTAUTH_SECRET ??= "01234567890123456789012345678901";
process.env.REDIS_URL ??= "redis://127.0.0.1:6379";
process.env.PAYMENT_ENCRYPTION_KEY ??=
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

try {
  const url = readFileSync(
    path.resolve(process.cwd(), ".vitest-database-url"),
    "utf8",
  ).trim();
  if (url) process.env.DATABASE_URL = url;
  process.env.PLATFORM_DATABASE_URL = process.env.DATABASE_URL;
} catch {
  /* globalSetup grava o arquivo; se faltar, DATABASE_URL do ambiente é usada */
}

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL ausente após o setup de testes. O isolamento não pode ser skipped.",
  );
}
