/**
 * Verifica se o app responde e se Postgres + Redis estão OK (/api/health).
 * Uso: npm run pilot:check
 * Opcional: PILOT_BASE_URL=https://... ou APP_URL
 */
import "dotenv/config";

const base = (
  process.env.PILOT_BASE_URL ||
  process.env.APP_URL ||
  "http://127.0.0.1:3000"
).replace(/\/$/, "");

const url = `${base}/api/health`;

async function main() {
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  const body = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    database?: boolean;
    redis?: boolean;
    error?: string;
  };

  if (!res.ok) {
    console.error(`[pilot-check] HTTP ${res.status}`, body);
    process.exit(1);
  }
  if (!body.ok) {
    console.error("[pilot-check] Health falhou (database/redis).", body);
    process.exit(1);
  }
  console.log("[pilot-check] OK", { url, ...body });
}

main().catch((e) => {
  console.error("[pilot-check] Erro de rede ou timeout:", e);
  process.exit(1);
});
