import { writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { config as loadDotenv } from "dotenv";
import postgres from "postgres";

loadDotenv();

const TEST_SECRETS = {
  JWT_SECRET: "01234567890123456789012345678901",
  NEXTAUTH_SECRET: "01234567890123456789012345678901",
  REDIS_URL: "redis://127.0.0.1:6379",
  PAYMENT_ENCRYPTION_KEY:
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
} as const;

const CONTAINER = "versatil-vitest-pg";
const DOCKER_URL =
  "postgresql://versatil_test:versatil_test@127.0.0.1:54329/versatil_test";
const URL_FILE = path.resolve(process.cwd(), ".vitest-database-url");

function applySecrets() {
  for (const [key, value] of Object.entries(TEST_SECRETS)) {
    if (!process.env[key]) process.env[key] = value;
  }
}

async function canConnect(url: string): Promise<boolean> {
  try {
    const sql = postgres(url, { max: 1, connect_timeout: 8 });
    await sql`select 1`;
    await sql.end({ timeout: 2 });
    return true;
  } catch {
    return false;
  }
}

function dockerAvailable(): boolean {
  const r = spawnSync("docker", ["info"], { encoding: "utf8" });
  return r.status === 0;
}

function startDockerPostgres() {
  spawnSync("docker", ["rm", "-f", CONTAINER], { encoding: "utf8" });
  const r = spawnSync(
    "docker",
    [
      "run",
      "-d",
      "--name",
      CONTAINER,
      "-e",
      "POSTGRES_USER=versatil_test",
      "-e",
      "POSTGRES_PASSWORD=versatil_test",
      "-e",
      "POSTGRES_DB=versatil_test",
      "-p",
      "54329:5432",
      "postgres:16-alpine",
    ],
    { encoding: "utf8" },
  );
  if (r.status !== 0) {
    throw new Error(
      `Falha ao subir PostgreSQL 16 de teste: ${r.stderr || r.stdout}`,
    );
  }
}

async function waitForUrl(url: string, attempts = 30): Promise<void> {
  for (let i = 0; i < attempts; i++) {
    if (await canConnect(url)) return;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`PostgreSQL de teste não ficou pronto: ${url}`);
}

function migrate() {
  const r = spawnSync("npx", ["drizzle-kit", "migrate"], {
    encoding: "utf8",
    env: process.env,
    shell: true,
  });
  if (r.status !== 0) {
    throw new Error(`drizzle-kit migrate falhou:\n${r.stderr || r.stdout}`);
  }
}

export default async function globalSetup() {
  applySecrets();
  let startedContainer = false;

  const existing = process.env.DATABASE_URL;
  if (existing && (await canConnect(existing))) {
    process.env.DATABASE_URL = existing;
  } else if (await canConnect(DOCKER_URL)) {
    process.env.DATABASE_URL = DOCKER_URL;
  } else {
    if (!dockerAvailable()) {
      throw new Error(
        "Isolamento multi-tenant exige PostgreSQL 16. Defina DATABASE_URL apontando para um Postgres acessível ou inicie o Docker Desktop para o Vitest subir postgres:16-alpine isolado. O teste não é skipped.",
      );
    }
    startDockerPostgres();
    startedContainer = true;
    await waitForUrl(DOCKER_URL);
    process.env.DATABASE_URL = DOCKER_URL;
  }

  writeFileSync(URL_FILE, process.env.DATABASE_URL ?? "", "utf8");
  migrate();

  return async () => {
    if (startedContainer && process.env.VITEST_KEEP_PG !== "1") {
      spawnSync("docker", ["rm", "-f", CONTAINER], { encoding: "utf8" });
    }
  };
}
