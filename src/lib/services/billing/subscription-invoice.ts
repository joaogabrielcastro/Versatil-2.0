import { and, eq } from "drizzle-orm";
import type { BillingInterval } from "@/lib/billing/interval-labels";
import {
  billablePeriodsForSubscription,
  subscriptionIdempotencyKey,
} from "@/lib/billing/period";
import {
  invoiceTimelineEvents,
  invoices,
  plans,
  studentSubscriptions,
} from "@/lib/db/schema";
import type { DbTransaction } from "@/lib/db/with-tenant";
import {
  withBypassRlsTransaction,
  withTenantTransaction,
} from "@/lib/db/with-tenant";
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

  if (existing) {
    return { created: false, invoiceId: existing.id };
  }

  const [inv] = await tx
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
    .returning({ id: invoices.id });

  await tx.insert(invoiceTimelineEvents).values({
    tenantId: input.tenantId,
    invoiceId: inv!.id,
    type: "note",
    payload: {
      message: input.note ?? "Fatura gerada pelo sistema.",
    },
  });

  return { created: true, invoiceId: inv!.id };
}

export async function createFirstSubscriptionInvoice(
  tenantId: string,
  studentId: string,
  subscriptionId: string,
  plan: PlanRow,
  startsAt: Date,
): Promise<void> {
  const idempotencyKey = subscriptionIdempotencyKey(subscriptionId, startsAt);

  await withTenantTransaction(tenantId, async (tx) => {
    await createInvoiceIfAbsent(tx, {
      tenantId,
      studentId,
      amountCents: plan.priceCents,
      dueAt: startsAt,
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

    for (const { subscription: sub, plan } of subs) {
      if (sub.startsAt.getTime() > now.getTime()) continue;
      if (sub.endsAt && sub.endsAt.getTime() < now.getTime()) continue;

      const interval = plan.billingInterval as BillingInterval;
      const periods = billablePeriodsForSubscription(
        sub.id,
        sub.startsAt,
        sub.endsAt,
        interval,
        now,
      );

      for (const period of periods) {
        const result = await createInvoiceIfAbsent(tx, {
          tenantId,
          studentId: sub.studentId,
          amountCents: plan.priceCents,
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

  for (const studentId of studentIds) {
    await recalculateStudentStatus(tenantId, studentId);
  }

  return { created };
}

export async function generateSubscriptionInvoicesAll(): Promise<{
  created: number;
  tenants: number;
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

  let created = 0;
  for (const { tenantId } of tenantRows) {
    const r = await generateSubscriptionInvoicesForTenant(tenantId);
    created += r.created;
  }

  return { created, tenants: tenantRows.length };
}
