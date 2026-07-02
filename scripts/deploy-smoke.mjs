/**
 * Smoke test pós-deploy: health + rotas públicas essenciais.
 * Uso: npm run deploy:smoke
 * Opcional: PILOT_BASE_URL ou APP_URL
 */
import "dotenv/config";

const base = (
  process.env.PILOT_BASE_URL ||
  process.env.APP_URL ||
  "http://127.0.0.1:3000"
).replace(/\/$/, "");

async function check(path, expectStatus = 200) {
  const url = `${base}${path}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (res.status !== expectStatus) {
    throw new Error(`${path} → HTTP ${res.status} (esperado ${expectStatus})`);
  }
  return res;
}

async function main() {
  console.log(`[deploy-smoke] Base: ${base}`);

  const healthRes = await check("/api/health");
  const health = await healthRes.json();
  if (!health.ok) {
    throw new Error(`Health não ok: ${JSON.stringify(health)}`);
  }
  console.log("[deploy-smoke] ✓ /api/health", health);

  await check("/");
  console.log("[deploy-smoke] ✓ /");

  await check("/login");
  console.log("[deploy-smoke] ✓ /login");

  const manifestRes = await check("/manifest.webmanifest");
  const manifest = await manifestRes.json();
  if (!manifest.name) {
    throw new Error("Manifest sem name");
  }
  console.log("[deploy-smoke] ✓ manifest", manifest.short_name ?? manifest.name);

  await check("/icon-192.png");
  console.log("[deploy-smoke] ✓ /icon-192.png");

  console.log("[deploy-smoke] Todos os checks passaram.");
}

main().catch((e) => {
  console.error("[deploy-smoke] FALHOU:", e.message ?? e);
  process.exit(1);
});
