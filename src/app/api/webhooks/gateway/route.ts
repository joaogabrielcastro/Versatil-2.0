import { jsonError } from "@/lib/api/json";

export const dynamic = "force-dynamic";

/**
 * Desativado. O corpo aceito por esta rota não traz id da cobrança, valor nem
 * moeda, então não comprova pagamento. Confirmação só entra por
 * POST /api/webhooks/stone. Ver INTEGRACOES.md.
 */
export async function POST() {
  return jsonError(
    410,
    "Este endpoint não liquida faturas. Use POST /api/webhooks/stone com id da cobrança, valor e moeda.",
  );
}
