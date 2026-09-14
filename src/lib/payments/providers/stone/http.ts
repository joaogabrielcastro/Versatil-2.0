import { PaymentProviderError } from "@/lib/payments/types";

/**
 * Transporte HTTP do Stone Connect.
 *
 * A Stone Connect 2.0 opera sobre a API Core v5 em `api.pagar.me`.
 * Isso NÃO é o produto/gateway Pagar.me do Versátil: é a infraestrutura
 * documentada no próprio código Connect (POST /orders + ServiceRefererName).
 * Não inventamos outro host/payload.
 */
export const STONE_CONNECT_API_BASE = "https://api.pagar.me/core/v5";

export function buildStoneConnectAuthHeader(secretKey: string): string {
  const token = Buffer.from(`${secretKey}:`, "utf8").toString("base64");
  return `Basic ${token}`;
}

export interface StoneConnectCharge {
  id: string;
  status: string;
  raw: unknown;
}

export interface StoneConnectOrder {
  id: string;
  status: string;
  charge: StoneConnectCharge | null;
  raw: unknown;
}

type Json = Record<string, unknown>;

function extractCharge(order: Json): StoneConnectCharge | null {
  const charges = Array.isArray(order.charges) ? (order.charges as Json[]) : [];
  const c = charges[0];
  if (!c) return null;
  return {
    id: String(c.id ?? ""),
    status: String(c.status ?? "unknown"),
    raw: c,
  };
}

export function mapStoneConnectChargeStatus(
  status: string,
): "paid" | "failed" | "pending" {
  const s = status.toLowerCase();
  if (s === "paid" || s === "captured") return "paid";
  if (
    s === "failed" ||
    s === "not_authorized" ||
    s === "canceled" ||
    s === "cancelled" ||
    s === "with_error"
  ) {
    return "failed";
  }
  return "pending";
}

export class StoneConnectHttpClient {
  private readonly authHeader: string;

  constructor(
    secretKey: string,
    private readonly baseUrl: string = STONE_CONNECT_API_BASE,
  ) {
    this.authHeader = buildStoneConnectAuthHeader(secretKey);
  }

  private async request(path: string, init: RequestInit): Promise<Json> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        headers: {
          Authorization: this.authHeader,
          "Content-Type": "application/json",
          Accept: "application/json",
          ...(init.headers ?? {}),
        },
        signal: AbortSignal.timeout(20_000),
      });
    } catch (e) {
      throw new PaymentProviderError(
        "stone_connect",
        "Falha de rede ao chamar Stone Connect (timeout ou POS inacessível).",
        e,
      );
    }

    const text = await res.text();
    const json = text ? (JSON.parse(text) as Json) : {};
    if (!res.ok) {
      const message =
        (json.message as string | undefined) ??
        `Stone Connect respondeu HTTP ${res.status}.`;
      throw new PaymentProviderError("stone_connect", message, json);
    }
    return json;
  }

  /** POST /orders — pedido aberto enviado ao POS. */
  async postOrder(
    payload: Record<string, unknown>,
    extraHeaders?: Record<string, string>,
  ): Promise<StoneConnectOrder> {
    const order = await this.request("/orders", {
      method: "POST",
      body: JSON.stringify(payload),
      headers: extraHeaders,
    });
    return {
      id: String(order.id ?? ""),
      status: String(order.status ?? "unknown"),
      charge: extractCharge(order),
      raw: order,
    };
  }

  /** GET /charges/{id} — consulta já existente na API Core usada pelo Connect. */
  async getCharge(chargeId: string): Promise<StoneConnectCharge> {
    const c = await this.request(`/charges/${encodeURIComponent(chargeId)}`, {
      method: "GET",
    });
    return {
      id: String(c.id ?? chargeId),
      status: String(c.status ?? "unknown"),
      raw: c,
    };
  }
}
