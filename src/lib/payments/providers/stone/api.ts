/**
 * Stone Connect 2.0 (contrato neste repositório): pedido aberto enviado ao POS.
 * Transporte: API Core v5 (`POST /orders`, `closed:false`, `poi_payment_settings`).
 * Confirmação: webhook Core `charge.paid` (HMAC) ou contrato interno mapeado.
 * Isso não é o checkout/produto Pagar.me do SaaS.
 */

/** Header obrigatório com o ID da empresa no Stone Partner Program. */
export const STONE_CONNECT_HEADER = "ServiceRefererName";

export type StonePaymentType = "credit" | "debit";

export interface BuildPosOrderInput {
  invoiceId: string;
  tenantId: string;
  studentId: string;
  amountCents: number;
  description: string;
  customerName: string;
  customerEmail?: string;
  customerDocument?: string;
  /** Seriais dos POS que devem receber o pedido (vazio = todos da conta). */
  terminalSerials: string[];
  paymentType: StonePaymentType;
  installments?: number;
  displayName?: string;
  printReceipt?: boolean;
}

/** Monta o corpo de POST /orders para pagamento na maquininha (Connect). */
export function buildPosOrderPayload(
  input: BuildPosOrderInput,
): Record<string, unknown> {
  const amount = Math.max(1, Math.round(input.amountCents));

  const customer: Record<string, unknown> = { name: input.customerName };
  if (input.customerEmail) customer.email = input.customerEmail;
  if (input.customerDocument) {
    customer.document = input.customerDocument;
    customer.type =
      input.customerDocument.length > 11 ? "company" : "individual";
  }

  return {
    code: input.invoiceId,
    customer,
    items: [
      {
        amount,
        description: input.description.slice(0, 255),
        quantity: 1,
        code: input.invoiceId,
      },
    ],
    closed: false,
    poi_payment_settings: {
      visible: "true",
      print_order_receipt: input.printReceipt ? "true" : "false",
      devices_serial_number: input.terminalSerials,
      payment_setup: {
        type: input.paymentType,
        installments:
          input.paymentType === "debit" ? 1 : input.installments ?? 1,
        installment_type: "merchant",
      },
      display_name:
        input.displayName ?? `Fatura ${input.invoiceId.slice(0, 8)}`,
    },
    metadata: {
      tenantId: input.tenantId,
      invoiceId: input.invoiceId,
      studentId: input.studentId,
    },
  };
}
