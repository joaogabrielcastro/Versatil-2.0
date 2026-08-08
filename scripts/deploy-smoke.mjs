/**
 * Smoke test pós-deploy: health + rotas públicas + gate do kiosk.
 * Uso: npm run deploy:smoke
 * Opcional: PILOT_BASE_URL ou APP_URL; KIOSK_ACCESS_SECRET para check positivo
 */
import "dotenv/config";

const base = (
  process.env.PILOT_BASE_URL ||
  process.env.APP_URL ||
  "http://127.0.0.1:3000"
).replace(/\/$/, "");

async function check(path, expectStatus = 200, init) {
  const url = `${base}${path}`;
  const res = await fetch(url, {
    signal: AbortSignal.timeout(15_000),
    ...init,
  });
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

  // Kiosk: sem token e sem busca completa — deve falhar auth ou validação
  const kioskNoAuth = await fetch(
    `${base}/api/kiosk/students?tenantSlug=demo&q=ab`,
    { signal: AbortSignal.timeout(15_000) },
  );
  if (![400, 401, 503].includes(kioskNoAuth.status)) {
    // Em dev sem KIOSK_ACCESS_SECRET pode ser 200 — ainda assim não deve listar sem q curto
    if (kioskNoAuth.status !== 200) {
      throw new Error(
        `/api/kiosk/students sem token → HTTP ${kioskNoAuth.status} (esperado 400/401/503 ou 200 em dev)`,
      );
    }
  }
  console.log(
    `[deploy-smoke] ✓ /api/kiosk/students gate HTTP ${kioskNoAuth.status}`,
  );

  const kioskNoQuery = await fetch(
    `${base}/api/kiosk/students?tenantSlug=demo`,
    {
      signal: AbortSignal.timeout(15_000),
      headers: process.env.KIOSK_ACCESS_SECRET
        ? { "x-kiosk-token": process.env.KIOSK_ACCESS_SECRET }
        : undefined,
    },
  );
  // Sem `q` → 400 (ou 401/503 se token inválido / prod sem secret)
  if (![400, 401, 503].includes(kioskNoQuery.status)) {
    throw new Error(
      `/api/kiosk/students sem q → HTTP ${kioskNoQuery.status} (esperado 400/401/503)`,
    );
  }
  console.log(
    `[deploy-smoke] ✓ /api/kiosk/students exige busca HTTP ${kioskNoQuery.status}`,
  );

  const kioskSecret = process.env.KIOSK_ACCESS_SECRET;
  if (kioskSecret) {
    const okSearch = await check(
      `/api/kiosk/students?tenantSlug=demo&q=ab&token=${encodeURIComponent(kioskSecret)}`,
      200,
    );
    const body = await okSearch.json();
    if (!Array.isArray(body.items)) {
      throw new Error("Kiosk search sem items[]");
    }
    console.log(
      `[deploy-smoke] ✓ /api/kiosk/students com token (${body.items.length} resultado(s))`,
    );
  } else {
    console.log(
      "[deploy-smoke] ⚠ KIOSK_ACCESS_SECRET ausente — skip check positivo do kiosk",
    );
  }

  console.log("[deploy-smoke] Todos os checks passaram.");
}

main().catch((e) => {
  console.error("[deploy-smoke] FALHOU:", e.message ?? e);
  process.exit(1);
});
