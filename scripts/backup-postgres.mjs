/**
 * Backup lógico do Postgres (`pg_dump`).
 *
 * Uso:
 *   npm run db:backup
 *
 * Variáveis:
 *   DATABASE_URL   — connection string (obrigatória)
 *   BACKUP_DIR     — pasta de destino (default: ./backups)
 *   BACKUP_KEEP    — quantos ficheiros .dump manter (default: 14)
 *
 * Requer `pg_dump` no PATH, ou Docker com o serviço postgres do Compose:
 *   BACKUP_VIA_DOCKER=1 npm run db:backup
 */
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import "dotenv/config";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("[db:backup] DATABASE_URL é obrigatória.");
  process.exit(1);
}

const backupDir = process.env.BACKUP_DIR || join(process.cwd(), "backups");
const keep = Math.max(1, Number(process.env.BACKUP_KEEP || 14) || 14);
const viaDocker = process.env.BACKUP_VIA_DOCKER === "1";

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
}

function pruneOld(dir) {
  const files = readdirSync(dir)
    .filter((f) => f.startsWith("versatil-") && f.endsWith(".dump"))
    .map((f) => ({ f, mtime: statSync(join(dir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);

  for (const extra of files.slice(keep)) {
    unlinkSync(join(dir, extra.f));
    console.log(`[db:backup] removido antigo: ${extra.f}`);
  }
}

async function dumpWithLocalPgDump(outPath) {
  const res = spawnSync(
    "pg_dump",
    ["--format=custom", "--no-owner", "--no-acl", `--file=${outPath}`, databaseUrl],
    { encoding: "utf8" },
  );
  if (res.error) throw res.error;
  if (res.status !== 0) {
    throw new Error(res.stderr || `pg_dump exit ${res.status}`);
  }
}

async function dumpViaDocker(outPath) {
  // Usa o container postgres do Compose (serviço `postgres`).
  const res = spawnSync(
    "docker",
    [
      "compose",
      "exec",
      "-T",
      "postgres",
      "pg_dump",
      "-U",
      "app",
      "-d",
      "tecnofit",
      "--format=custom",
      "--no-owner",
      "--no-acl",
    ],
    { encoding: "buffer", maxBuffer: 512 * 1024 * 1024 },
  );
  if (res.error) throw res.error;
  if (res.status !== 0) {
    throw new Error(
      (res.stderr && res.stderr.toString("utf8")) || `docker pg_dump exit ${res.status}`,
    );
  }
  writeFileSync(outPath, res.stdout);
}

async function main() {
  if (!existsSync(backupDir)) {
    mkdirSync(backupDir, { recursive: true });
  }

  const file = `versatil-${stamp()}.dump`;
  const outPath = join(backupDir, file);
  console.log(`[db:backup] a escrever ${outPath}`);

  if (viaDocker) {
    await dumpViaDocker(outPath);
  } else {
    await dumpWithLocalPgDump(outPath);
  }

  const size = statSync(outPath).size;
  console.log(`[db:backup] OK (${size} bytes)`);
  pruneOld(backupDir);
  console.log(`[db:backup] retenção: últimos ${keep} dumps em ${backupDir}`);
}

main().catch((e) => {
  console.error("[db:backup] FALHOU:", e.message ?? e);
  console.error(
    "Dica: instale PostgreSQL client tools (pg_dump) ou use BACKUP_VIA_DOCKER=1 com `docker compose up -d postgres`.",
  );
  process.exit(1);
});
