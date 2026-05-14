/**
 * Migrações + seed demo (tenant, utilizador, planos).
 * Uso: npm run pilot:setup
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.join(fileURLToPath(new URL(".", import.meta.url)), "..");

function run(cmd, args) {
  const r = spawnSync(cmd, args, {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: process.env,
  });
  if (r.status !== 0) {
    process.exit(r.status ?? 1);
  }
}

console.log("[pilot-setup] Aplicar migrações…");
run("node", ["scripts/pre-start.mjs"]);
console.log("[pilot-setup] Seed…");
run("npm", ["run", "db:seed"]);
console.log("[pilot-setup] Concluído.");
