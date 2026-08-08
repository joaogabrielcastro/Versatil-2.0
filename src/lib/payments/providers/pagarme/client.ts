import { PaymentProviderError } from "@/lib/payments/types";
import {
  PAGARME_BASE_URL,
  buildAuthHeader,
  buildOrderPayload,
  type BuildOrderInput,
} from "@/lib/payments/providers/pagarme/api";

/** Resultado enxuto de uma cobrança dentro de um pedido. */
export interface PagarmeCharge {
  id: string;
  status: string;
  paymentMethod?: string;
  /** URL de pagamento (pix qr_code_url / boleto url), quando aplicável. */
  paymentUrl?: string;
  /** Conteúdo do QR (pix copia-e-cola). */
  pixQrCode?: string;
  raw: unknown;
}

export interface PagarmeOrder {
  id: string;
  status: string;
  charge: PagarmeCharge | null;
  raw: unknown;
}

type Json = Record<string, unknown>;

function extractCharge(order: Json): PagarmeCharge | null {
  const charges = Array.isArray(order.charges) ? (order.charges as Json[]) : [];
  const c = charges[0];
  if (!c) return null;
  const lastTx = (c.last_transaction ?? {}) as Json;
  return {
    id: String(c.id ?? ""),
    status: String(c.status ?? "unknown"),
    paymentMethod: c.payment_method ? String(c.payment_method) : undefined,
    paymentUrl:
      (lastTx.qr_code_url as string | undefined) ??
      (lastTx.url as string | undefined) ??
      (lastTx.pdf as string | undefined),
    pixQrCode: lastTx.qr_code as string | undefined,
    raw: c,
  };
}

export class PagarmeClient {
  private readonly authHeader: string;

  constructor(
    secretKey: string,
    private readonly baseUrl: string = PAGARME_BASE_URL,
  ) {
    this.authHeader = buildAuthHeader(secretKey);
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
      throw new PaymentProviderError("pagarme", "Falha de rede ao chamar Pagar.me.", e);
    }

    const text = await res.text();
    const json = text ? (JSON.parse(text) as Json) : {};
    if (!res.ok) {
      const message =
        (json.message as string | undefined) ??
        `Pagar.me respondeu HTTP ${res.status}.`;
      throw new PaymentProviderError("pagarme", message, json);
    }
    return json;
  }

  /** Envia um corpo de pedido já montado (POST /orders), com headers extras opcionais. */
  async postOrder(
    payload: Record<string, unknown>,
    extraHeaders?: Record<string, string>,
  ): Promise<PagarmeOrder> {
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

  /** Cria um pedido (POST /orders) e retorna a primeira cobrança. */
  async createOrder(input: BuildOrderInput): Promise<PagarmeOrder> {
    return this.postOrder(buildOrderPayload(input));
  }

  /** Cria um cliente (POST /customers) e retorna o id. */
  async createCustomer(input: {
    name: string;
    email?: string;
    document?: string;
  }): Promise<string> {
    const body: Json = { name: input.name };
    if (input.email) body.email = input.email;
    if (input.document) {
      body.document = input.document;
      body.type = input.document.length > 11 ? "company" : "individual";
    }
    const c = await this.request("/customers", {
      method: "POST",
      body: JSON.stringify(body),
    });
    const id = String(c.id ?? "");
    if (!id) {
      throw new PaymentProviderError("pagarme", "Cliente criado sem id.", c);
    }
    return id;
  }

  /** Salva um cartão de um cliente a partir de um token (POST /customers/{id}/cards). */
  async createCard(customerId: string, cardToken: string): Promise<string> {
    const card = await this.request(
      `/customers/${encodeURIComponent(customerId)}/cards`,
      { method: "POST", body: JSON.stringify({ token: cardToken }) },
    );
    const id = String(card.id ?? "");
    if (!id) {
      throw new PaymentProviderError("pagarme", "Cartão salvo sem id.", card);
    }
    return id;
  }

  /** Consulta uma cobrança (GET /charges/{id}). */
  async getCharge(chargeId: string): Promise<PagarmeCharge> {
    const c = await this.request(`/charges/${encodeURIComponent(chargeId)}`, {
      method: "GET",
    });
    const lastTx = (c.last_transaction ?? {}) as Json;
    return {
      id: String(c.id ?? chargeId),
      status: String(c.status ?? "unknown"),
      paymentMethod: c.payment_method ? String(c.payment_method) : undefined,
      paymentUrl:
        (lastTx.qr_code_url as string | undefined) ??
        (lastTx.url as string | undefined),
      pixQrCode: lastTx.qr_code as string | undefined,
      raw: c,
    };
  }
}
