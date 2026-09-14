import { NextResponse } from "next/server";
import { z } from "zod";
import { logAudit } from "@/lib/audit/log";
import { jsonError } from "@/lib/api/json";
import { getSession } from "@/lib/auth/session";
import { chargeInvoiceOnStone } from "@/lib/services/billing/stone-charge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  invoiceId: z.string().uuid(),
  terminalSerial: z.string().max(64).optional(),
  paymentType: z.enum(["credit", "debit"]).optional(),
  installments: z.number().int().min(1).max(12).optional(),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session || session.typ !== "tenant" || !session.tid) {
    return jsonError(401, "Não autenticado.");
  }
  const tenantId = session.tid;

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return jsonError(400, "Payload inválido.");
  }

  const result = await chargeInvoiceOnStone({
    tenantId,
    invoiceId: body.invoiceId,
    terminalSerial: body.terminalSerial,
    paymentType: body.paymentType,
    installments: body.installments,
  });

  if (!result.ok) {
    return jsonError(result.http, result.error);
  }

  await logAudit({
    tenantId,
    actorUserId: session.sub,
    action: "billing.stone_terminal_charge",
    entity: "invoice",
    entityId: body.invoiceId,
    payload: {
      externalId: result.externalId,
      reused: result.reused,
      paymentType: body.paymentType ?? null,
    },
  });

  return NextResponse.json({
    externalId: result.externalId,
    status: result.status,
    reused: result.reused,
  });
}
