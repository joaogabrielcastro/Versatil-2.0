import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { logAudit } from "@/lib/audit/log";
import { jsonError } from "@/lib/api/json";
import { getSession } from "@/lib/auth/session";
import { invoices, students } from "@/lib/db/schema";
import { withTenantTransaction } from "@/lib/db/with-tenant";
import { pagarmeProvider } from "@/lib/payments/providers/pagarme";
import { PaymentProviderError } from "@/lib/payments/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  invoiceId: z.string().uuid(),
  method: z.enum(["pix", "boleto", "card"]),
  cardId: z.string().max(255).optional(),
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
      .select({
        fullName: students.fullName,
        email: students.email,
        cpf: students.cpf,
      })
      .from(students)
      .where(and(eq(students.id, inv.studentId), eq(students.tenantId, tenantId)))
      .limit(1);
    return { inv, student: student ?? null };
  });

  if (!data) {
    return jsonError(404, "Fatura não encontrada.");
  }
  if (data.inv.status !== "open") {
    return jsonError(400, "Fatura não está em aberto.");
  }

  try {
    const result = await pagarmeProvider.createCheckout!({
      tenantId,
      invoiceId: data.inv.id,
      studentId: data.inv.studentId,
      amountCents: data.inv.amountCents,
      currency: data.inv.currency,
      description: "Mensalidade",
      method: body.method,
      cardId: body.cardId,
      customerName: data.student?.fullName ?? "Aluno",
      customerEmail: data.student?.email ?? undefined,
      customerDocument: data.student?.cpf ?? undefined,
    });

    await withTenantTransaction(tenantId, async (tx) => {
      await tx
        .update(invoices)
        .set({ externalId: result.chargeId })
        .where(eq(invoices.id, data.inv.id));
    });

    await logAudit({
      tenantId,
      actorUserId: session.sub,
      action: "billing.pagarme_checkout_created",
      entity: "invoice",
      entityId: data.inv.id,
      payload: { chargeId: result.chargeId, method: body.method },
    });

    return NextResponse.json({
      chargeId: result.chargeId,
      status: result.status,
      url: result.url ?? null,
      pixQrCode: result.pixQrCode ?? null,
    });
  } catch (e) {
    if (e instanceof PaymentProviderError) {
      return jsonError(502, e.message);
    }
    throw e;
  }
}
