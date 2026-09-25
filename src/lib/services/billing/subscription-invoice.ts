import { and, eq } from "drizzle-orm";
import type { BillingInterval } from "@/lib/billing/interval-labels";
import {
  billablePeriodsForSubscription,
  periodDueAt,
  subscriptionIdempotencyKey,
} from "@/lib/billing/period";
import { invoiceTimelineEvents, invoices, plans, studentSubscriptions, subscriptionTerms } from "@/lib/db/schema";
import type { DbTransaction } from "@/lib/db/with-tenant";
import {
  withBypassRlsTransaction,
  withTenantTransaction,
} from "@/lib/db/with-tenant";
import { toIsoDateInTz } from "@/lib/dates/br";
import { eachTenant } from "@/lib/cron/record";
import { noteBillingReview } from "@/lib/services/billing/subscription-actions";
import { recalculateStudentStatus } from "@/lib/services/student-status";

type PlanRow = {
  id: string;
  priceCents: number;
  billingInterval: string;
};

export async function createInvoiceIfAbsent(
  tx: DbTransaction,
  input: {
    tenantId: string;
    studentId: string;
    amountCents: number;
    dueAt: Date;
    idempotencyKey: string;
    note?: string;
  },
): Promise<{ created: boolean; invoiceId: string | null }> {
  const [existing] = await tx
    .select({ id: invoices.id, status: invoices.status })
    .from(invoices)
    .where(
      and(
        eq(invoices.tenantId, input.tenantId),
        eq(invoices.idempotencyKey, input.idempotencyKey),
      ),
    )
    .limit(1);

  if (!existing) {
    const inserted = await tx
      .insert(invoices)
      .values({
        tenantId: input.tenantId,
        studentId: input.studentId,
        amountCents: input.amountCents,
        currency: "BRL",
        status: "open",
        dueAt: input.dueAt,
        idempotencyKey: input.idempotencyKey,
      })
      .onConflictDoNothing({
        target: [invoices.tenantId, invoices.idempotencyKey],
      })
      .returning({ id: invoices.id });
    if (!inserted[0]) {
      const [race] = await tx
        .select({ id: invoices.id })
        .from(invoices)
        .where(
          and(
            eq(invoices.tenantId, input.tenantId),
            eq(invoices.idempotencyKey, input.idempotencyKey),
          ),
        )
        .limit(1);
      return { created: false, invoiceId: race?.id ?? null };
    }
    await tx.insert(invoiceTimelineEvents).values({
      tenantId: input.tenantId,
      invoiceId: inserted[0].id,
      type: "note",
      payload: {
        message: input.note ?? "Fatura gerada pelo sistema.",
      },
    });
    return { created: true, invoiceId: inserted[0].id };
  }

  return { created: false, invoiceId: existing.id };
}

export async function createFirstSubscriptionInvoice(
  tenantId: string,
  studentId: string,
  subscriptionId: string,
  plan: PlanRow,
  startsAt: Date,
): Promise<void> {
  const dueAt = periodDueAt(startsAt, plan.billingInterval as BillingInterval, 0);
  const idempotencyKey = subscriptionIdempotencyKey(subscriptionId, dueAt);

  await withTenantTransaction(tenantId, async (tx) => {
    await createInvoiceIfAbsent(tx, {
      tenantId,
      studentId,
      amountCents: plan.priceCents,
      dueAt,
      idempotencyKey,
      note: "Primeira fatura da assinatura.",
    });
  });

  await recalculateStudentStatus(tenantId, studentId);
}

export async function generateSubscriptionInvoicesForTenant(
  tenantId: string,
): Promise<{ created: number }> {
  const now = new Date();
  let created = 0;
  const studentIds = new Set<string>();
  const reviews: Array<{ subscriptionId: string; periodKey: string; reason: string }> = [];
  const cap = 200;

  await withTenantTransaction(tenantId, async (tx) => {
    const subs = await tx
      .select({
        subscription: studentSubscriptions,
        plan: plans,
      })
      .from(studentSubscriptions)
      .innerJoin(plans, eq(studentSubscriptions.planId, plans.id))
      .where(
        and(
          eq(studentSubscriptions.tenantId, tenantId),
          eq(studentSubscriptions.active, true),
        ),
      );

    for (const { subscription: sub } of subs) {
      if (created >= cap) break;
      if (sub.startsAt.getTime() > now.getTime()) continue;
      const interval = sub.billingInterval;
      if (interval !== "monthly" && interval !== "semesterly" && interval !== "yearly") {
        reviews.push({
          subscriptionId: sub.id,
          periodKey: `sub:${sub.id}:unknown`,
          reason: "Intervalo contratado ausente ou inválido. Período não faturado.",
        });
        continue;
      }
      if (sub.priceCents == null) {
        reviews.push({
          subscriptionId: sub.id,
          periodKey: `sub:${sub.id}:price`,
          reason: "Preço contratado ausente. Período não faturado.",
        });
        continue;
      }

      const periods = billablePeriodsForSubscription(
        sub.id,
        sub.startsAt,
        sub.endsAt,
        interval,
        now,
      );
      const terms = await tx
        .select()
        .from(subscriptionTerms)
        .where(eq(subscriptionTerms.subscriptionId, sub.id));
      const cut = sub.cancelEffectiveAt ? toIsoDateInTz(sub.cancelEffectiveAt) : null;

      for (const period of periods) {
        if (created >= cap) break;
        const dueDay = toIsoDateInTz(period.dueAt);
        if (cut && dueDay >= cut) continue;
        const covering = terms
          .filter((term) => {
            if (toIsoDateInTz(term.validFrom) > dueDay) return false;
            if (term.endsAt && toIsoDateInTz(term.endsAt) < dueDay) return false;
            return true;
          })
          .sort((a, b) => b.validFrom.getTime() - a.validFrom.getTime());
        const term = covering[0];
        if (!term) {
          reviews.push({
            subscriptionId: sub.id,
            periodKey: period.idempotencyKey,
            reason:
              "Sem termo válido para este ciclo. O preço copiado na migration não cobre períodos anteriores a valid_from.",
          });
          continue;
        }
        let amount = term.priceCents;
        if (
          sub.scheduledEffectiveAt &&
          sub.scheduledPriceCents != null &&
          toIsoDateInTz(period.dueAt) >= toIsoDateInTz(sub.scheduledEffectiveAt)
        ) {
          amount = sub.scheduledPriceCents;
          if (sub.scheduledPlanId && sub.scheduledBillingInterval) {
            await tx
              .update(studentSubscriptions)
              .set({
                planId: sub.scheduledPlanId,
                priceCents: sub.scheduledPriceCents,
                billingInterval: sub.scheduledBillingInterval,
                scheduledPlanId: null,
                scheduledPriceCents: null,
                scheduledBillingInterval: null,
                scheduledEffectiveAt: null,
              })
              .where(eq(studentSubscriptions.id, sub.id));
          }
        }
        const result = await createInvoiceIfAbsent(tx, {
          tenantId,
          studentId: sub.studentId,
          amountCents: amount,
          dueAt: period.dueAt,
          idempotencyKey: period.idempotencyKey,
          note: "Fatura recorrente do plano.",
        });
        if (result.created) {
          created++;
          studentIds.add(sub.studentId);
        }
      }
    }
  });

  for (const review of reviews) {
    await noteBillingReview(tenantId, review.subscriptionId, review.periodKey, review.reason);
  }

  for (const studentId of studentIds) {
    await recalculateStudentStatus(tenantId, studentId);
  }

  return { created };
}

export async function generateSubscriptionInvoicesAll(): Promise<{
  created: number;
  tenants: number;
  failedTenantIds: string[];
}> {
  const tenantRows = await withBypassRlsTransaction(async (tx) => {
    const rows = await tx
      .select({ tenantId: studentSubscriptions.tenantId })
      .from(studentSubscriptions)
      .where(eq(studentSubscriptions.active, true));
    const seen = new Set<string>();
    return rows.filter((r) => {
      if (seen.has(r.tenantId)) return false;
      seen.add(r.tenantId);
      return true;
    });
  });

  const { values, failedTenantIds } = await eachTenant(
    "generate-invoices",
    tenantRows.map((row) => row.tenantId),
    (tenantId) => generateSubscriptionInvoicesForTenant(tenantId),
  );
  const created = values.reduce((sum, row) => sum + row.created, 0);
  return { created, tenants: tenantRows.length, failedTenantIds };
}
