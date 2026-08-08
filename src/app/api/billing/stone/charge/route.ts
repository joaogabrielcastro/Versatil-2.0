import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { logAudit } from "@/lib/audit/log";
import { jsonError } from "@/lib/api/json";
import { getSession } from "@/lib/auth/session";
import { invoiceTimelineEvents, invoices, students } from "@/lib/db/schema";
import { withTenantTransaction } from "@/lib/db/with-tenant";
import { stoneConnectProvider } from "@/lib/payments/providers/stone-connect";
import { PaymentProviderError } from "@/lib/payments/types";

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

  const data = await withTenantTransaction(tenantId, async (tx) => {
    const [inv] = await tx
      .select({
        id: invoices.id,
        studentId: invoices.studentId,
        amountCents: invoices.amountCents,
        currency: invoices.currency,
        status: invoices.status,
      })
      .from(invoices)
      .where(and(eq(invoices.id, body.invoiceId), eq(invoices.tenantId, tenantId)))
      .limit(1);
    if (!inv) return null;
    const [student] = await tx
      .select({ fullName: students.fullName, email: students.email, cpf: students.cpf })
      .from(students)
      .where(and(eq(students.id, inv.studentId), eq(students.tenantId, tenantId)))
      .limit(1);
    return { inv, student: student ?? null };
  });

  if (!data) return jsonError(404, "Fatura não encontrada.");
  if (data.inv.status !== "open") return jsonError(400, "Fatura não está em aberto.");

  try {
    const result = await stoneConnectProvider.chargeOnTerminal!({
      tenantId,
      invoiceId: data.inv.id,
      studentId: data.inv.studentId,
      amountCents: data.inv.amountCents,
      currency: data.inv.currency,
      description: "Mensalidade",
      customerName: data.student?.fullName ?? "Aluno",
      customerEmail: data.student?.email ?? undefined,
      customerDocument: data.student?.cpf ?? undefined,
      terminalSerial: body.terminalSerial,
      paymentType: body.paymentType,
      installments: body.installments,
    });

    await withTenantTransaction(tenantId, async (tx) => {
      await tx
        .update(invoices)
        .set({ externalId: result.externalId })
        .where(eq(invoices.id, data.inv.id));
      await tx.insert(invoiceTimelineEvents).values({
        tenantId,
        invoiceId: data.inv.id,
        type: "note",
        payload: {
          message: "Cobrança enviada à maquininha (Stone Connect).",
          provider: "stone_connect",
          externalId: result.externalId,
        },
      });
    });

    await logAudit({
      tenantId,
      actorUserId: session.sub,
      action: "billing.stone_terminal_charge",
      entity: "invoice",
      entityId: data.inv.id,
      payload: { externalId: result.externalId, paymentType: body.paymentType ?? null },
    });

    return NextResponse.json({ externalId: result.externalId, status: result.status });
  } catch (e) {
    if (e instanceof PaymentProviderError) return jsonError(502, e.message);
    throw e;
  }
}
