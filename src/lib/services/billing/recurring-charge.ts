import { and, desc, eq, isNotNull, lte, or, isNull } from "drizzle-orm";
import {
  invoiceTimelineEvents,
  invoices,
  studentSubscriptions,
  students,
} from "@/lib/db/schema";
import {
  withBypassRlsTransaction,
  withTenantTransaction,
} from "@/lib/db/with-tenant";
import { getPagarmeClient, pagarmeProvider } from "@/lib/payments/providers/pagarme";
import {
  MAX_CHARGE_ATTEMPTS,
  computeNextChargeAttempt,
} from "@/lib/payments/recurring";
import { PaymentProviderError } from "@/lib/payments/types";

/** Estados de cobrança que indicam falha síncrona (cartão recusado, etc.). */
const FAILED_STATUSES = new Set(["failed", "canceled", "not_authorized"]);

/** Assinatura ativa mais recente do aluno. */
async function activeSubscription(tenantId: string, studentId: string) {
  return withTenantTransaction(tenantId, async (tx) => {
    const [row] = await tx
      .select()
      .from(studentSubscriptions)
      .where(
        and(
          eq(studentSubscriptions.tenantId, tenantId),
          eq(studentSubscriptions.studentId, studentId),
          eq(studentSubscriptions.active, true),
        ),
      )
      .orderBy(desc(studentSubscriptions.createdAt))
      .limit(1);
    return row ?? null;
  });
}

export interface AutoRenewStatus {
  autoRenew: boolean;
  hasCard: boolean;
  provider: string | null;
  hasSubscription: boolean;
}

export async function getAutoRenewStatus(
  tenantId: string,
  studentId: string,
): Promise<AutoRenewStatus> {
  const sub = await activeSubscription(tenantId, studentId);
  return {
    autoRenew: sub?.autoRenew ?? false,
    hasCard: Boolean(sub?.externalCardId),
    provider: sub?.provider ?? null,
    hasSubscription: Boolean(sub),
  };
}

/** Liga/desliga a renovação automática da assinatura ativa. */
export async function setAutoRenew(
  tenantId: string,
  studentId: string,
  autoRenew: boolean,
): Promise<{ ok: boolean; reason?: string }> {
  const sub = await activeSubscription(tenantId, studentId);
  if (!sub) return { ok: false, reason: "Aluno sem assinatura ativa." };
  if (autoRenew && !sub.externalCardId) {
    return { ok: false, reason: "Salve um cartão antes de ativar a renovação." };
  }
  await withTenantTransaction(tenantId, async (tx) => {
    await tx
      .update(studentSubscriptions)
      .set({ autoRenew })
      .where(eq(studentSubscriptions.id, sub.id));
  });
  return { ok: true };
}

/**
 * Salva um cartão (a partir de um token gerado no front com a chave pública) e
 * vincula à assinatura ativa, ativando a renovação automática.
 */
export async function saveSubscriptionCard(
  tenantId: string,
  studentId: string,
  cardToken: string,
): Promise<{ ok: boolean; reason?: string }> {
  const sub = await activeSubscription(tenantId, studentId);
  if (!sub) return { ok: false, reason: "Aluno sem assinatura ativa." };

  const student = await withTenantTransaction(tenantId, async (tx) => {
    const [s] = await tx
      .select({ fullName: students.fullName, email: students.email, cpf: students.cpf })
      .from(students)
      .where(and(eq(students.id, studentId), eq(students.tenantId, tenantId)))
      .limit(1);
    return s ?? null;
  });

  const client = await getPagarmeClient(tenantId);
  const customerId =
    sub.externalCustomerId ??
    (await client.createCustomer({
      name: student?.fullName ?? "Aluno",
      email: student?.email ?? undefined,
      document: student?.cpf?.replace(/\D/g, "") || undefined,
    }));
  const cardId = await client.createCard(customerId, cardToken);

  await withTenantTransaction(tenantId, async (tx) => {
    await tx
      .update(studentSubscriptions)
      .set({
        provider: "pagarme",
        externalCustomerId: customerId,
        externalCardId: cardId,
        autoRenew: true,
      })
      .where(eq(studentSubscriptions.id, sub.id));
  });
  return { ok: true };
}

export interface ChargeRunResult {
  attempted: number;
  charged: number;
  failed: number;
}

/**
 * Cobra automaticamente as faturas em aberto de assinaturas com renovação
 * automática e cartão salvo. Idempotente por backoff (não recobra dentro da
 * janela) e tolerante a falhas por fatura.
 */
export async function chargeDueInvoicesForTenant(
  tenantId: string,
  now: Date = new Date(),
): Promise<ChargeRunResult> {
  const rows = await withTenantTransaction(tenantId, async (tx) => {
    return tx
      .select({
        invoiceId: invoices.id,
        studentId: invoices.studentId,
        amountCents: invoices.amountCents,
        currency: invoices.currency,
        chargeAttempts: invoices.chargeAttempts,
        cardId: studentSubscriptions.externalCardId,
        fullName: students.fullName,
        email: students.email,
        cpf: students.cpf,
      })
      .from(invoices)
      .innerJoin(
        studentSubscriptions,
        and(
          eq(studentSubscriptions.studentId, invoices.studentId),
          eq(studentSubscriptions.tenantId, invoices.tenantId),
          eq(studentSubscriptions.active, true),
          eq(studentSubscriptions.autoRenew, true),
          isNotNull(studentSubscriptions.externalCardId),
        ),
      )
      .innerJoin(students, eq(students.id, invoices.studentId))
      .where(
        and(
          eq(invoices.tenantId, tenantId),
          eq(invoices.status, "open"),
          lte(invoices.dueAt, now),
          or(
            isNull(invoices.nextChargeAttemptAt),
            lte(invoices.nextChargeAttemptAt, now),
          ),
        ),
      );
  });

  const result: ChargeRunResult = { attempted: 0, charged: 0, failed: 0 };

  for (const row of rows) {
    if (row.chargeAttempts >= MAX_CHARGE_ATTEMPTS) continue;
    result.attempted++;
    const attempts = row.chargeAttempts + 1;
    const nextAt = computeNextChargeAttempt(attempts, now);

    try {
      const charge = await pagarmeProvider.createCheckout!({
        tenantId,
        invoiceId: row.invoiceId,
        studentId: row.studentId,
        amountCents: row.amountCents,
        currency: row.currency,
        description: "Mensalidade (renovação automática)",
        method: "card",
        cardId: row.cardId!,
        customerName: row.fullName,
        customerEmail: row.email ?? undefined,
        customerDocument: row.cpf ?? undefined,
      });

      const failedSync = FAILED_STATUSES.has(charge.status);
      await withTenantTransaction(tenantId, async (tx) => {
        await tx
          .update(invoices)
          .set({
            externalId: charge.chargeId,
            chargeAttempts: attempts,
            nextChargeAttemptAt: nextAt,
            lastChargeError: failedSync ? `status:${charge.status}` : null,
          })
          .where(eq(invoices.id, row.invoiceId));
        await tx.insert(invoiceTimelineEvents).values({
          tenantId,
          invoiceId: row.invoiceId,
          type: failedSync ? "gateway_failure" : "note",
          payload: {
            message: failedSync
              ? `Cobrança automática recusada (${charge.status}).`
              : "Cobrança automática enviada ao Pagar.me.",
            provider: "pagarme",
            chargeId: charge.chargeId,
            attempt: attempts,
          },
        });
      });

      if (failedSync) result.failed++;
      else result.charged++;
    } catch (e) {
      result.failed++;
      const message =
        e instanceof PaymentProviderError ? e.message : "Erro ao cobrar.";
      await withTenantTransaction(tenantId, async (tx) => {
        await tx
          .update(invoices)
          .set({
            chargeAttempts: attempts,
            nextChargeAttemptAt: nextAt,
            lastChargeError: message.slice(0, 500),
          })
          .where(eq(invoices.id, row.invoiceId));
        await tx.insert(invoiceTimelineEvents).values({
          tenantId,
          invoiceId: row.invoiceId,
          type: "gateway_failure",
          payload: { message, provider: "pagarme", attempt: attempts },
        });
      });
    }
  }

  return result;
}

/** Executa a auto-cobrança para todos os tenants com assinaturas auto-renew. */
export async function chargeDueInvoicesAll(
  now: Date = new Date(),
): Promise<{ tenants: number } & ChargeRunResult> {
  const tenantRows = await withBypassRlsTransaction(async (tx) => {
    const rows = await tx
      .selectDistinct({ tenantId: studentSubscriptions.tenantId })
      .from(studentSubscriptions)
      .where(
        and(
          eq(studentSubscriptions.active, true),
          eq(studentSubscriptions.autoRenew, true),
          isNotNull(studentSubscriptions.externalCardId),
        ),
      );
    return rows;
  });

  const total: { tenants: number } & ChargeRunResult = {
    tenants: tenantRows.length,
    attempted: 0,
    charged: 0,
    failed: 0,
  };
  for (const { tenantId } of tenantRows) {
    const r = await chargeDueInvoicesForTenant(tenantId, now);
    total.attempted += r.attempted;
    total.charged += r.charged;
    total.failed += r.failed;
  }
  return total;
}
