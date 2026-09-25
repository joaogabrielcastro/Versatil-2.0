import { and, eq, sql } from "drizzle-orm";
import { invoiceTimelineEvents, invoices, students } from "@/lib/db/schema";
import { withTenantTransaction } from "@/lib/db/with-tenant";
import type { TerminalChargeInput, TerminalChargeResult } from "@/lib/payments/provider";
import { computeNextChargeAttempt } from "@/lib/payments/recurring";
import { stoneConnectProvider } from "@/lib/payments/providers/stone-connect";
import {
  decideStoneChargeAction,
  stoneAttemptKey,
} from "@/lib/payments/stone-idempotency";
import { PaymentProviderError } from "@/lib/payments/types";

export type StoneChargeResult =
  | {
      ok: true;
      reused: boolean;
      externalId: string;
      status: string;
    }
  | { ok: false; http: number; error: string };

export type StoneChargeSender = (
  input: TerminalChargeInput,
) => Promise<TerminalChargeResult>;

const defaultSender: StoneChargeSender = (input) =>
  stoneConnectProvider.chargeOnTerminal!(input);

type PreparedSend = {
  phase: "send";
  idempotencyKey: string;
  amountCents: number;
  currency: string;
  studentId: string;
  customerName: string;
  customerEmail?: string;
  customerDocument?: string;
};

export async function chargeInvoiceOnStone(
  input: {
    tenantId: string;
    invoiceId: string;
    terminalSerial?: string;
    paymentType?: "credit" | "debit";
    installments?: number;
  },
  sender: StoneChargeSender = defaultSender,
): Promise<StoneChargeResult> {
  const prepared = await withTenantTransaction(input.tenantId, async (tx) => {
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
        gatewayIdempotencyKey: invoices.gatewayIdempotencyKey,
        chargeAttempts: invoices.chargeAttempts,
      })
      .from(invoices)
      .where(
        and(eq(invoices.id, input.invoiceId), eq(invoices.tenantId, input.tenantId)),
      )
      .for("update")
      .limit(1);

    if (!inv) {
      return { phase: "done" as const, result: { ok: false as const, http: 404, error: "Fatura não encontrada." } };
    }
    if (inv.status !== "open" && inv.status !== "paid" && inv.status !== "void") {
      return { phase: "done" as const, result: { ok: false as const, http: 400, error: "Fatura não está em aberto." } };
    }

    const decision = decideStoneChargeAction({
      status: inv.status,
      gatewayChargeStatus: inv.gatewayChargeStatus,
      externalId: inv.externalId,
      idempotencyKey: inv.gatewayIdempotencyKey,
    });
    if (decision.action === "reject_paid") {
      return { phase: "done" as const, result: { ok: false as const, http: 400, error: "Fatura já está paga." } };
    }
    if (decision.action === "reject_void") {
      return { phase: "done" as const, result: { ok: false as const, http: 400, error: "Fatura cancelada." } };
    }
    if (decision.action === "reuse") {
      return {
        phase: "done" as const,
        result: {
          ok: true as const,
          reused: true,
          externalId: decision.externalId,
          status: "sent_to_terminal",
        },
      };
    }
    if (decision.action === "in_flight" || decision.action === "hold_unknown") {
      return {
        phase: "done" as const,
        result: {
          ok: false as const,
          http: 409,
          error:
            decision.action === "hold_unknown"
              ? "A Stone não confirmou esta tentativa. Não reenviamos a cobrança. Concilie na maquininha antes de cobrar de novo."
              : "Cobrança pendente sem chave de idempotência. Concilie manualmente.",
        },
      };
    }
    if (inv.status !== "open") {
      return { phase: "done" as const, result: { ok: false as const, http: 400, error: "Fatura não está em aberto." } };
    }

    const idempotencyKey = stoneAttemptKey(inv.id, inv.chargeAttempts + 1);

    if (decision.action === "create") {
      await tx
        .update(invoices)
        .set({
          gatewayChargeStatus: "pending",
          gatewayIdempotencyKey: idempotencyKey,
          chargeAttempts: inv.chargeAttempts + 1,
          externalId: null,
        })
        .where(and(eq(invoices.id, inv.id), eq(invoices.tenantId, input.tenantId)));
    }

    const [student] = await tx
      .select({
        fullName: students.fullName,
        email: students.email,
        cpf: students.cpf,
      })
      .from(students)
      .where(and(eq(students.id, inv.studentId), eq(students.tenantId, input.tenantId)))
      .limit(1);

    const send: PreparedSend = {
      phase: "send",
      idempotencyKey,
      amountCents: inv.amountCents,
      currency: inv.currency,
      studentId: inv.studentId,
      customerName: student?.fullName ?? "Aluno",
      customerEmail: student?.email ?? undefined,
      customerDocument: student?.cpf ?? undefined,
    };
    return send;
  });

  if (prepared.phase === "done") return prepared.result;

  let result: TerminalChargeResult;
  try {
    result = await sender({
      tenantId: input.tenantId,
      invoiceId: input.invoiceId,
      studentId: prepared.studentId,
      amountCents: prepared.amountCents,
      currency: prepared.currency,
      description: "Mensalidade",
      customerName: prepared.customerName,
      customerEmail: prepared.customerEmail,
      customerDocument: prepared.customerDocument,
      terminalSerial: input.terminalSerial,
      paymentType: input.paymentType,
      installments: input.installments,
    });
  } catch (e) {
    if (e instanceof PaymentProviderError && e.outcome === "unknown") {
      return {
        ok: false,
        http: 502,
        error: "Resposta da Stone desconhecida. A tentativa fica pendente e não abre outra cobrança.",
      };
    }
    await withTenantTransaction(input.tenantId, async (tx) => {
      const [inv] = await tx
        .select({ chargeAttempts: invoices.chargeAttempts })
        .from(invoices)
        .where(and(eq(invoices.id, input.invoiceId), eq(invoices.tenantId, input.tenantId)))
        .limit(1);
      await tx
        .update(invoices)
        .set({
          gatewayChargeStatus: "failed",
          nextChargeAttemptAt: computeNextChargeAttempt(inv?.chargeAttempts ?? 1),
          lastChargeError:
            e instanceof PaymentProviderError
              ? e.message.slice(0, 500)
              : "Falha ao enviar cobrança à Stone.",
        })
        .where(and(eq(invoices.id, input.invoiceId), eq(invoices.tenantId, input.tenantId)));
    });
    if (e instanceof PaymentProviderError) {
      return { ok: false, http: 502, error: e.message };
    }
    throw e;
  }

  if (!result.externalId) {
    return {
      ok: false,
      http: 502,
      error: "Stone não devolveu id da cobrança. A tentativa permanece pendente.",
    };
  }

  await withTenantTransaction(input.tenantId, async (tx) => {
    await tx
      .update(invoices)
      .set({
        externalId: result.externalId,
        gatewayChargeStatus: "pending",
      })
      .where(and(eq(invoices.id, input.invoiceId), eq(invoices.tenantId, input.tenantId)));
    await tx.insert(invoiceTimelineEvents).values({
      tenantId: input.tenantId,
      invoiceId: input.invoiceId,
      type: "note",
      payload: {
        message: "Cobrança enviada à maquininha (Stone Connect).",
        provider: "stone_connect",
        externalId: result.externalId,
        idempotencyKey: prepared.idempotencyKey,
      },
    });
  });

  return {
    ok: true,
    reused: false,
    externalId: result.externalId,
    status: result.status,
  };
}

/** Usado em testes de concorrência sem HTTP: reserva a fatura uma única vez. */
export async function reserveStoneChargeSlot(
  tenantId: string,
  invoiceId: string,
): Promise<"created" | "reuse" | "hold_unknown" | "in_flight" | "reject_paid" | "reject_void" | "not_found"> {
  return withTenantTransaction(tenantId, async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${tenantId}), hashtext(${invoiceId}))`);
    const [inv] = await tx
      .select({
        status: invoices.status,
        gatewayChargeStatus: invoices.gatewayChargeStatus,
        externalId: invoices.externalId,
        gatewayIdempotencyKey: invoices.gatewayIdempotencyKey,
        chargeAttempts: invoices.chargeAttempts,
      })
      .from(invoices)
      .where(and(eq(invoices.id, invoiceId), eq(invoices.tenantId, tenantId)))
      .for("update")
      .limit(1);
    if (!inv) return "not_found";
    const decision = decideStoneChargeAction({
      status: inv.status,
      gatewayChargeStatus: inv.gatewayChargeStatus,
      externalId: inv.externalId,
      idempotencyKey: inv.gatewayIdempotencyKey,
    });
    if (decision.action === "create") {
      await tx
        .update(invoices)
        .set({
          gatewayChargeStatus: "pending",
          gatewayIdempotencyKey: stoneAttemptKey(invoiceId, inv.chargeAttempts + 1),
          chargeAttempts: inv.chargeAttempts + 1,
        })
        .where(and(eq(invoices.id, invoiceId), eq(invoices.tenantId, tenantId)));
      return "created";
    }
    return decision.action;
  });
}
