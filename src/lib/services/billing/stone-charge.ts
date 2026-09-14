import { and, eq, sql } from "drizzle-orm";
import { invoiceTimelineEvents, invoices, students } from "@/lib/db/schema";
import { withTenantTransaction } from "@/lib/db/with-tenant";
import { computeNextChargeAttempt } from "@/lib/payments/recurring";
import { stoneConnectProvider } from "@/lib/payments/providers/stone-connect";
import { decideStoneChargeAction } from "@/lib/payments/stone-idempotency";
import { PaymentProviderError } from "@/lib/payments/types";

export type StoneChargeResult =
  | {
      ok: true;
      reused: boolean;
      externalId: string;
      status: string;
    }
  | { ok: false; http: number; error: string };

export async function chargeInvoiceOnStone(input: {
  tenantId: string;
  invoiceId: string;
  terminalSerial?: string;
  paymentType?: "credit" | "debit";
  installments?: number;
}): Promise<StoneChargeResult> {
  return withTenantTransaction(input.tenantId, async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${input.tenantId}), hashtext(${input.invoiceId}))`,
    );
    const [inv] = await tx
      .select({
        id: invoices.id,
        studentId: invoices.studentId,
        amountCents: invoices.amountCents,
        currency: invoices.currency,
        status: invoices.status,
        externalId: invoices.externalId,
        gatewayChargeStatus: invoices.gatewayChargeStatus,
        chargeAttempts: invoices.chargeAttempts,
      })
      .from(invoices)
      .where(
        and(
          eq(invoices.id, input.invoiceId),
          eq(invoices.tenantId, input.tenantId),
        ),
      )
      .for("update")
      .limit(1);

    if (!inv) {
      return { ok: false, http: 404, error: "Fatura não encontrada." };
    }

    const decision = decideStoneChargeAction(inv);
    if (decision.action === "reject_paid") {
      return { ok: false, http: 400, error: "Fatura já está paga." };
    }
    if (decision.action === "reject_void") {
      return { ok: false, http: 400, error: "Fatura cancelada." };
    }
    if (decision.action === "reuse") {
      return {
        ok: true,
        reused: true,
        externalId: decision.externalId,
        status: "sent_to_terminal",
      };
    }
    if (decision.action === "in_flight") {
      return {
        ok: false,
        http: 409,
        error: "Cobrança já em andamento para esta fatura.",
      };
    }
    if (inv.status !== "open") {
      return { ok: false, http: 400, error: "Fatura não está em aberto." };
    }

    await tx
      .update(invoices)
      .set({
        gatewayChargeStatus: "pending",
        chargeAttempts: inv.chargeAttempts + 1,
      })
      .where(
        and(eq(invoices.id, inv.id), eq(invoices.tenantId, input.tenantId)),
      );

    const [student] = await tx
      .select({
        fullName: students.fullName,
        email: students.email,
        cpf: students.cpf,
      })
      .from(students)
      .where(
        and(
          eq(students.id, inv.studentId),
          eq(students.tenantId, input.tenantId),
        ),
      )
      .limit(1);

    try {
      const result = await stoneConnectProvider.chargeOnTerminal!({
        tenantId: input.tenantId,
        invoiceId: inv.id,
        studentId: inv.studentId,
        amountCents: inv.amountCents,
        currency: inv.currency,
        description: "Mensalidade",
        customerName: student?.fullName ?? "Aluno",
        customerEmail: student?.email ?? undefined,
        customerDocument: student?.cpf ?? undefined,
        terminalSerial: input.terminalSerial,
        paymentType: input.paymentType,
        installments: input.installments,
      });

      await tx
        .update(invoices)
        .set({
          externalId: result.externalId,
          gatewayChargeStatus: "pending",
        })
        .where(
          and(eq(invoices.id, inv.id), eq(invoices.tenantId, input.tenantId)),
        );
      await tx.insert(invoiceTimelineEvents).values({
        tenantId: input.tenantId,
        invoiceId: inv.id,
        type: "note",
        payload: {
          message: "Cobrança enviada à maquininha (Stone Connect).",
          provider: "stone_connect",
          externalId: result.externalId,
          reused: false,
        },
      });

      return {
        ok: true,
        reused: false,
        externalId: result.externalId,
        status: result.status,
      };
    } catch (e) {
      await tx
        .update(invoices)
        .set({
          gatewayChargeStatus: "failed",
          nextChargeAttemptAt: computeNextChargeAttempt(
            inv.chargeAttempts + 1,
          ),
          lastChargeError:
            e instanceof PaymentProviderError
              ? e.message.slice(0, 500)
              : "Falha ao enviar cobrança à Stone.",
        })
        .where(
          and(eq(invoices.id, inv.id), eq(invoices.tenantId, input.tenantId)),
        );
      if (e instanceof PaymentProviderError) {
        return { ok: false, http: 502, error: e.message };
      }
      throw e;
    }
  });
}

/** Usado em testes de concorrência sem HTTP: reserva a fatura uma única vez. */
export async function reserveStoneChargeSlot(
  tenantId: string,
  invoiceId: string,
): Promise<"created" | "reuse" | "in_flight" | "reject_paid" | "reject_void" | "not_found"> {
  return withTenantTransaction(tenantId, async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${tenantId}), hashtext(${invoiceId}))`);
    const [inv] = await tx
      .select({
        status: invoices.status,
        gatewayChargeStatus: invoices.gatewayChargeStatus,
        externalId: invoices.externalId,
      })
      .from(invoices)
      .where(and(eq(invoices.id, invoiceId), eq(invoices.tenantId, tenantId)))
      .for("update")
      .limit(1);
    if (!inv) return "not_found";
    const decision = decideStoneChargeAction(inv);
    if (decision.action === "create") {
      await tx
        .update(invoices)
        .set({ gatewayChargeStatus: "pending" })
        .where(and(eq(invoices.id, invoiceId), eq(invoices.tenantId, tenantId)));
      return "created";
    }
    return decision.action;
  });
}
