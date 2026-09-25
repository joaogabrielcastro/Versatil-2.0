/**
 * Restaura um dump feito por `npm run db:backup`.
 * Não usa DATABASE_URL de propósito: aponte RESTORE_DATABASE_URL para um banco vazio de ensaio.
 *
 *   CONFIRM_RESTORE=yes RESTORE_DATABASE_URL=postgresql://... npm run db:restore -- backups/versatil-....dump
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const file = process.argv[2];
const target = process.env.RESTORE_DATABASE_URL;
if (process.env.CONFIRM_RESTORE !== "yes" || !target || !file) {
  console.error(
    "[db:restore] Recusado. Use CONFIRM_RESTORE=yes, RESTORE_DATABASE_URL (banco de ensaio, não o de produção) e o caminho do .dump.",
  );
  process.exit(1);
}
if (process.env.DATABASE_URL && target === process.env.DATABASE_URL) {
  console.error("[db:restore] Recusado. RESTORE_DATABASE_URL não pode ser igual a DATABASE_URL.");
  process.exit(1);
}
if (!existsSync(file)) {
  console.error(`[db:restore] Arquivo não encontrado: ${file}`);
  process.exit(1);
}

const res = spawnSync(
  "pg_restore",
  ["--clean", "--if-exists", "--no-owner", `--dbname=${target}`, file],
  { encoding: "utf8" },
);
if (res.error) {
  console.error("[db:restore] FALHOU:", res.error.message);
  process.exit(1);
}
if (res.status !== 0) {
  console.error(res.stderr || `pg_restore exit ${res.status}`);
  process.exit(res.status ?? 1);
}
console.log("[db:restore] OK. Confira contagem de tenants, alunos e faturas antes de promover este banco.");
