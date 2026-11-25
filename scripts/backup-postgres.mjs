/**
 * Backup lógico do Postgres (`pg_dump`).
 *
 * Uso:
 *   npm run db:backup
 *
 * Variáveis:
 *   BACKUP_DATABASE_URL — login dono das tabelas (o mesmo das migrations).
 *                         O login de runtime (versatil_runtime) não serve: o
 *                         RLS impede o pg_dump. Sem esta variável, tenta
 *                         MIGRATION_DATABASE_URL e por fim DATABASE_URL.
 *   BACKUP_DIR     — pasta de destino (default: ./backups)
 *   BACKUP_KEEP    — quantos ficheiros .dump manter (default: 14)
 *
 * Requer `pg_dump` no PATH, ou Docker com o serviço postgres do Compose:
 *   BACKUP_VIA_DOCKER=1 npm run db:backup
 */
import { spawnSync } from "node:child_process";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import "dotenv/config";

const databaseUrl =
  process.env.BACKUP_DATABASE_URL ||
  process.env.MIGRATION_DATABASE_URL ||
  process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("[db:backup] BACKUP_DATABASE_URL (ou DATABASE_URL) é obrigatória.");
  process.exit(1);
}
if (!process.env.BACKUP_DATABASE_URL && !process.env.MIGRATION_DATABASE_URL) {
  console.warn(
    "[db:backup] BACKUP_DATABASE_URL ausente; usando DATABASE_URL. Em produção use o login dono das tabelas.",
  );
}

const backupDir = process.env.BACKUP_DIR || join(process.cwd(), "backups");
const keep = Math.max(1, Number(process.env.BACKUP_KEEP || 14) || 14);
const viaDocker = process.env.BACKUP_VIA_DOCKER === "1";

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
}

/** Um dump custom válido começa com "PGDMP". Arquivo vazio ou truncado não conta. */
function isValidDump(path) {
  try {
    if (statSync(path).size < 5) return false;
    const fd = openSync(path, "r");
    try {
      const buf = Buffer.alloc(5);
      readSync(fd, buf, 0, 5, 0);
      return buf.toString("latin1") === "PGDMP";
    } finally {
      closeSync(fd);
    }
  } catch {
    return false;
  }
}

/**
 * Só roda depois de um backup bem-sucedido. Conta apenas dumps válidos:
 * falhas nunca empurram backups bons para fora da retenção.
 */
function pruneOld(dir) {
  for (const f of readdirSync(dir)) {
    if (f.startsWith("versatil-") && f.endsWith(".partial")) {
      unlinkSync(join(dir, f));
      console.log(`[db:backup] removido parcial: ${f}`);
    }
  }
  const files = readdirSync(dir)
    .filter((f) => f.startsWith("versatil-") && f.endsWith(".dump"))
    .filter((f) => isValidDump(join(dir, f)))
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
  const partialPath = `${outPath}.partial`;
  console.log(`[db:backup] a escrever ${outPath}`);

  try {
    if (viaDocker) {
      await dumpViaDocker(partialPath);
    } else {
      await dumpWithLocalPgDump(partialPath);
    }
    if (!isValidDump(partialPath)) {
      throw new Error("dump vazio ou inválido (cabeçalho PGDMP ausente).");
    }
  } catch (err) {
    if (existsSync(partialPath)) unlinkSync(partialPath);
    throw err;
  }

  renameSync(partialPath, outPath);
  const size = statSync(outPath).size;
  console.log(`[db:backup] OK (${size} bytes)`);
  pruneOld(backupDir);
  console.log(`[db:backup] retenção: últimos ${keep} dumps válidos em ${backupDir}`);
}

main().catch((e) => {
  const message = String(e?.message ?? e);
  console.error("[db:backup] FALHOU:", message);
  if (/row-level security|permission denied/i.test(message)) {
    console.error(
      "Dica: o login usado não pode ler todas as linhas (RLS). Defina BACKUP_DATABASE_URL com o login dono das tabelas. Os backups anteriores foram preservados.",
    );
  } else {
    console.error(
      "Dica: instale PostgreSQL client tools (pg_dump) ou use BACKUP_VIA_DOCKER=1 com `docker compose up -d postgres`. Os backups anteriores foram preservados.",
    );
  }
  process.exit(1);
});
