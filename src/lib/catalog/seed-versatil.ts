import { and, eq } from "drizzle-orm";
import {
  VERSATIL_ACTIVITIES,
  VERSATIL_PLANS,
} from "@/lib/catalog/versatil-table";
import { classActivities, classSlots, plans } from "@/lib/db/schema";
import type { DbTransaction } from "@/lib/db/with-tenant";

export async function seedVersatilCatalog(tx: DbTransaction, tenantId: string) {
  let plansCreated = 0;
  let activitiesCreated = 0;

  for (const plan of VERSATIL_PLANS) {
    const [existing] = await tx
      .select({ id: plans.id })
      .from(plans)
      .where(and(eq(plans.tenantId, tenantId), eq(plans.code, plan.code)))
      .limit(1);
    if (existing) continue;
    await tx.insert(plans).values({
      tenantId,
      code: plan.code,
      name: plan.name,
      category: plan.category,
      kind: plan.kind,
      termMonths: plan.termMonths,
      priceCents: plan.priceCents,
      billingInterval: plan.billingInterval,
      accessEffect: plan.accessEffect ?? null,
      active: true,
    });
    plansCreated += 1;
  }

  for (const activity of VERSATIL_ACTIVITIES) {
    const [existing] = await tx
      .select({ id: classActivities.id })
      .from(classActivities)
      .where(
        and(
          eq(classActivities.tenantId, tenantId),
          eq(classActivities.code, activity.code),
        ),
      )
      .limit(1);
    if (existing) continue;
    const [created] = await tx
      .insert(classActivities)
      .values({
        tenantId,
        code: activity.code,
        name: activity.name,
        category: activity.category,
        sortOrder: activity.sortOrder,
        active: true,
      })
      .returning({ id: classActivities.id });
    activitiesCreated += 1;
    if (activity.slots.length > 0) {
      await tx.insert(classSlots).values(
        activity.slots.map((slot) => ({
          tenantId,
          activityId: created!.id,
          weekday: slot.weekday,
          startTime: slot.startTime,
        })),
      );
    }
  }

  return { plansCreated, activitiesCreated };
}
