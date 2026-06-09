import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { logAudit } from "@/lib/audit/log";
import { jsonError } from "@/lib/api/json";
import { getSession } from "@/lib/auth/session";
import {
  invoiceTimelineEvents,
  invoices,
} from "@/lib/db/schema";
import { withTenantTransaction } from "@/lib/db/with-tenant";
import { MANUAL_PAYMENT_METHODS } from "@/lib/billing/payment-methods";
import { recalculateStudentStatus } from "@/lib/services/student-status";

export const dynamic = "force-dynamic";

const settleSchema = z.object({
  paymentMethod: z.enum(MANUAL_PAYMENT_METHODS).optional(),
  note: z.string().max(500).optional(),
});

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session || session.typ !== "tenant" || !session.tid) {
    return jsonError(401, "Não autenticado como equipe da academia.");
  }
  const tenantId = session.tid;

  const { id: invoiceId } = await ctx.params;
  if (!z.string().uuid().safeParse(invoiceId).success) {
    return jsonError(400, "ID de fatura inválido.");
  }

  let body: z.infer<typeof settleSchema>;
  try {
    body = settleSchema.parse(await request.json().catch(() => ({})));
  } catch {
    return jsonError(400, "Payload inválido.");
  }

  const now = new Date();

  try {
    const result = await withTenantTransaction(tenantId, async (tx) => {
      const [inv] = await tx
        .select({
          id: invoices.id,
          studentId: invoices.studentId,
          status: invoices.status,
        })
        .from(invoices)
        .where(and(eq(invoices.id, invoiceId), eq(invoices.tenantId, tenantId)))
        .limit(1);
      if (!inv) {
        throw new Error("not_found");
      }
      if (inv.status === "paid" || inv.status === "void") {
        return { skipped: true as const, studentId: inv.studentId };
      }

      await tx
        .update(invoices)
        .set({
          status: "paid",
          paidAt: now,
          settlementSource: "manual_reception",
        })
        .where(eq(invoices.id, invoiceId));

      await tx.insert(invoiceTimelineEvents).values({
        tenantId,
        invoiceId,
        type: "manual_payment",
        payload: {
          paymentMethod: body.paymentMethod ?? null,
          note: body.note ?? null,
          by: session.sub,
        },
      });

      return { skipped: false as const, studentId: inv.studentId };
    });

    await recalculateStudentStatus(tenantId, result.studentId);

    if (!result.skipped) {
      await logAudit({
        tenantId,
        actorUserId: session.sub,
        action: "invoice.settled_manual",
        entity: "invoice",
        entityId: invoiceId,
        payload: {
          paymentMethod: body.paymentMethod ?? null,
          note: body.note ?? null,
        },
      });
    }

    return NextResponse.json({
      ok: true,
      idempotent: result.skipped,
    });
  } catch (e) {
    if (e instanceof Error && e.message === "not_found") {
      return jsonError(404, "Fatura não encontrada.");
    }
    throw e;
  }
}
