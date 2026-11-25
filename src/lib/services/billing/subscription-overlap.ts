import { and, eq, gt, gte, isNull, or } from "drizzle-orm";
import { plans, studentSubscriptions } from "@/lib/db/schema";
import type { DbTransaction } from "@/lib/db/with-tenant";

/**
 * Matrícula ainda vigente na data de início da nova, na mesma modalidade.
 * Modalidade = categoria do plano; plano sem categoria só conflita consigo mesmo.
 * Planos de modalidades diferentes (ex.: Academia + Lutas) podem coexistir.
 */
export async function findOverlappingSubscription(
  tx: DbTransaction,
  input: {
    tenantId: string;
    studentId: string;
    planId: string;
    category: string | null;
    startsAt: Date;
  },
): Promise<{ subscriptionId: string; planName: string } | null> {
  const sameModality = input.category
    ? eq(plans.category, input.category)
    : eq(studentSubscriptions.planId, input.planId);
  const [row] = await tx
    .select({ subscriptionId: studentSubscriptions.id, planName: plans.name })
    .from(studentSubscriptions)
    .innerJoin(plans, eq(plans.id, studentSubscriptions.planId))
    .where(
      and(
        eq(studentSubscriptions.tenantId, input.tenantId),
        eq(studentSubscriptions.studentId, input.studentId),
        eq(studentSubscriptions.active, true),
        or(isNull(studentSubscriptions.endsAt), gte(studentSubscriptions.endsAt, input.startsAt)),
        or(
          isNull(studentSubscriptions.cancelEffectiveAt),
          gt(studentSubscriptions.cancelEffectiveAt, input.startsAt),
        ),
        sameModality,
      ),
    )
    .limit(1);
  return row ?? null;
}
