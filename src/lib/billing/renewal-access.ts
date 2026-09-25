import { and, eq, ne } from "drizzle-orm";
import { renewalChargePeriods, renewalCoversInstant } from "@/lib/billing/renewal-billing";
import { billingReviews, invoices, studentSubscriptions, subscriptionTerms } from "@/lib/db/schema";
import type { DbTransaction } from "@/lib/db/with-tenant";

export type RenewalCoverage = {
  coversNow: boolean;
  chargeMissing: boolean;
  review: { subscriptionId: string; periodKey: string; reason: string } | null;
};

const MISSING_REASON =
  "Renovação vigente sem a fatura deste período. Não é inadimplência; gere as faturas do período.";

export async function renewalCoverageForStudent(
  tx: DbTransaction,
  tenantId: string,
  studentId: string,
  now = new Date(),
): Promise<RenewalCoverage> {
  const terms = await tx
    .select({
      id: subscriptionTerms.id,
      subscriptionId: subscriptionTerms.subscriptionId,
      startsAt: subscriptionTerms.startsAt,
      endsAt: subscriptionTerms.endsAt,
      billingInterval: subscriptionTerms.billingInterval,
      priceCents: subscriptionTerms.priceCents,
    })
    .from(subscriptionTerms)
    .innerJoin(
      studentSubscriptions,
      eq(subscriptionTerms.subscriptionId, studentSubscriptions.id),
    )
    .where(
      and(
        eq(subscriptionTerms.tenantId, tenantId),
        eq(studentSubscriptions.studentId, studentId),
        eq(studentSubscriptions.active, true),
        eq(subscriptionTerms.source, "renewal"),
      ),
    );

  const openSubs = await tx
    .select({
      id: studentSubscriptions.id,
      cancelRequestedAt: studentSubscriptions.cancelRequestedAt,
    })
    .from(studentSubscriptions)
    .where(
      and(
        eq(studentSubscriptions.tenantId, tenantId),
        eq(studentSubscriptions.studentId, studentId),
      ),
    );
  const cancelled = new Set(
    openSubs.filter((row) => row.cancelRequestedAt).map((row) => row.id),
  );

  const existing = await tx
    .select({ key: invoices.idempotencyKey })
    .from(invoices)
    .where(
      and(
        eq(invoices.tenantId, tenantId),
        eq(invoices.studentId, studentId),
        ne(invoices.status, "void"),
      ),
    );
  const keys = new Set(existing.map((row) => row.key).filter((key): key is string => Boolean(key)));

  let coversNow = false;
  let chargeMissing = false;
  let review: RenewalCoverage["review"] = null;

  for (const term of terms) {
    if (cancelled.has(term.subscriptionId)) continue;
    if (!renewalCoversInstant(term.startsAt, term.endsAt, now)) continue;
    coversNow = true;
    const renewal = renewalChargePeriods(
      {
        subscriptionId: term.subscriptionId,
        startsAt: term.startsAt,
        endsAt: term.endsAt,
        billingInterval: term.billingInterval,
        priceCents: term.priceCents,
      },
      now,
      0,
    );
    if (renewal.review) {
      chargeMissing = true;
      review ??= {
        subscriptionId: term.subscriptionId,
        periodKey: `renewal:${term.id}:invalid`,
        reason: renewal.review,
      };
      continue;
    }
    const missing = renewal.periods.find((period) => !keys.has(period.idempotencyKey));
    if (missing) {
      chargeMissing = true;
      review ??= {
        subscriptionId: term.subscriptionId,
        periodKey: `renewal-missing:${missing.idempotencyKey}`,
        reason: MISSING_REASON,
      };
    }
  }

  return { coversNow, chargeMissing, review };
}

export async function recordRenewalBillingGap(
  tx: DbTransaction,
  tenantId: string,
  review: NonNullable<RenewalCoverage["review"]>,
): Promise<void> {
  await tx
    .insert(billingReviews)
    .values({
      tenantId,
      subscriptionId: review.subscriptionId,
      periodKey: review.periodKey,
      reason: review.reason.slice(0, 500),
    })
    .onConflictDoNothing({
      target: [billingReviews.tenantId, billingReviews.periodKey],
    });
}
