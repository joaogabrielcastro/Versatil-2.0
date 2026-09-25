import { and, eq } from "drizzle-orm";
import type { BillingInterval } from "@/lib/billing/interval-labels";
import {
  invoicesToVoid,
  nextCycleDue,
  paidPeriodEnd,
} from "@/lib/billing/subscription-lifecycle";
import { subscriptionIdempotencyKey } from "@/lib/billing/period";
import {
  billingReviews,
  invoices,
  plans,
  studentSubscriptions,
  subscriptionTerms,
} from "@/lib/db/schema";
import { withTenantTransaction } from "@/lib/db/with-tenant";

type ActionResult =
  | { ok: true; detail: Record<string, unknown> }
  | { ok: false; http: number; error: string };

function intervalOf(value: string): BillingInterval {
  if (value === "semesterly" || value === "yearly" || value === "monthly") return value;
  return "monthly";
}

export async function cancelSubscription(input: {
  tenantId: string;
  studentId: string;
  subscriptionId: string;
  actorUserId: string;
  reason: string;
  now?: Date;
}): Promise<ActionResult> {
  const now = input.now ?? new Date();
  return withTenantTransaction(input.tenantId, async (tx) => {
    const [sub] = await tx
      .select()
      .from(studentSubscriptions)
      .where(
        and(
          eq(studentSubscriptions.id, input.subscriptionId),
          eq(studentSubscriptions.tenantId, input.tenantId),
          eq(studentSubscriptions.studentId, input.studentId),
        ),
      )
      .for("update")
      .limit(1);
    if (!sub) return { ok: false, http: 404, error: "Assinatura não encontrada." };
    if (sub.cancelRequestedAt) {
      return {
        ok: true,
        detail: { repeated: true, cancelEffectiveAt: sub.cancelEffectiveAt },
      };
    }

    const paidRows = await tx
      .select({ dueAt: invoices.dueAt })
      .from(invoices)
      .where(
        and(
          eq(invoices.tenantId, input.tenantId),
          eq(invoices.studentId, input.studentId),
          eq(invoices.status, "paid"),
        ),
      );
    const interval = intervalOf(sub.billingInterval);
    const coverage = paidPeriodEnd(
      now,
      paidRows
        .filter((row) => row.dueAt)
        .map((row) => ({ dueAt: row.dueAt, interval })),
    );
    const effective = coverage ?? now;
    const openRows = await tx
      .select({
        id: invoices.id,
        dueAt: invoices.dueAt,
        gatewayChargeStatus: invoices.gatewayChargeStatus,
        idempotencyKey: invoices.idempotencyKey,
      })
      .from(invoices)
      .where(
        and(
          eq(invoices.tenantId, input.tenantId),
          eq(invoices.studentId, input.studentId),
          eq(invoices.status, "open"),
        ),
      );
    const prefix = `sub:${sub.id}:`;
    const related = openRows.filter((row) => row.idempotencyKey?.startsWith(prefix));
    const decision = invoicesToVoid(effective, related);
    if (decision.blockedByPos.length > 0) {
      return {
        ok: false,
        http: 409,
        error:
          "Há cobrança na maquininha sem confirmação. Concilie antes de cancelar. Cancelar aqui não cancela a venda na Stone.",
      };
    }
    for (const id of decision.voidIds) {
      const [locked] = await tx
        .select({ status: invoices.status, gatewayChargeStatus: invoices.gatewayChargeStatus })
        .from(invoices)
        .where(and(eq(invoices.id, id), eq(invoices.tenantId, input.tenantId)))
        .for("update")
        .limit(1);
      if (!locked || locked.status !== "open") continue;
      if (locked.gatewayChargeStatus === "pending") {
        return {
          ok: false,
          http: 409,
          error:
            "Há cobrança na maquininha sem confirmação. Concilie antes de cancelar. Cancelar aqui não cancela a venda na Stone.",
        };
      }
      await tx
        .update(invoices)
        .set({ status: "void", lastChargeError: "Cancelada: período a partir do encerramento." })
        .where(and(eq(invoices.id, id), eq(invoices.tenantId, input.tenantId)));
    }
    const immediate = coverage == null;
    await tx
      .update(studentSubscriptions)
      .set({
        cancelRequestedAt: now,
        cancelEffectiveAt: effective,
        cancelReason: input.reason.slice(0, 500),
        cancelRequestedBy: input.actorUserId,
        endsAt: effective,
        active: immediate ? false : sub.active,
      })
      .where(eq(studentSubscriptions.id, sub.id));
    return {
      ok: true,
      detail: { immediate, cancelEffectiveAt: effective, voided: decision.voidIds.length },
    };
  });
}

export async function schedulePlanChange(input: {
  tenantId: string;
  studentId: string;
  subscriptionId: string;
  planId: string;
  now?: Date;
}): Promise<ActionResult> {
  const now = input.now ?? new Date();
  return withTenantTransaction(input.tenantId, async (tx) => {
    const [sub] = await tx
      .select()
      .from(studentSubscriptions)
      .where(
        and(
          eq(studentSubscriptions.id, input.subscriptionId),
          eq(studentSubscriptions.tenantId, input.tenantId),
          eq(studentSubscriptions.studentId, input.studentId),
        ),
      )
      .for("update")
      .limit(1);
    if (!sub || !sub.active) {
      return { ok: false, http: 404, error: "Assinatura ativa não encontrada." };
    }
    if (sub.cancelRequestedAt) {
      return { ok: false, http: 409, error: "Assinatura com cancelamento agendado." };
    }
    const [plan] = await tx
      .select()
      .from(plans)
      .where(and(eq(plans.id, input.planId), eq(plans.tenantId, input.tenantId)))
      .limit(1);
    if (!plan) return { ok: false, http: 404, error: "Plano não encontrado." };
    const due = nextCycleDue(
      sub.startsAt,
      intervalOf(sub.billingInterval),
      now,
      sub.endsAt,
    );
    if (!due) {
      return { ok: false, http: 409, error: "Não há próximo ciclo dentro da vigência." };
    }
    const key = subscriptionIdempotencyKey(sub.id, due);
    const [existing] = await tx
      .select({
        id: invoices.id,
        status: invoices.status,
        gatewayChargeStatus: invoices.gatewayChargeStatus,
      })
      .from(invoices)
      .where(and(eq(invoices.tenantId, input.tenantId), eq(invoices.idempotencyKey, key)))
      .for("update")
      .limit(1);
    if (existing?.status === "paid") {
      return {
        ok: false,
        http: 409,
        error: "O próximo ciclo já está pago. Resolva essa fatura antes de agendar a troca.",
      };
    }
    if (existing?.gatewayChargeStatus === "pending") {
      return {
        ok: false,
        http: 409,
        error:
          "O próximo ciclo está na maquininha sem confirmação. Concilie antes de agendar a troca.",
      };
    }
    if (existing && existing.status === "open") {
      await tx
        .update(invoices)
        .set({ amountCents: plan.priceCents })
        .where(and(eq(invoices.id, existing.id), eq(invoices.tenantId, input.tenantId)));
    }
    await tx
      .update(studentSubscriptions)
      .set({
        scheduledPlanId: plan.id,
        scheduledPriceCents: plan.priceCents,
        scheduledBillingInterval: plan.billingInterval,
        scheduledEffectiveAt: due,
      })
      .where(eq(studentSubscriptions.id, sub.id));
    return { ok: true, detail: { effectiveAt: due, priceCents: plan.priceCents } };
  });
}

export async function clearScheduledPlanChange(input: {
  tenantId: string;
  studentId: string;
  subscriptionId: string;
}): Promise<ActionResult> {
  return withTenantTransaction(input.tenantId, async (tx) => {
    const [sub] = await tx
      .select()
      .from(studentSubscriptions)
      .where(
        and(
          eq(studentSubscriptions.id, input.subscriptionId),
          eq(studentSubscriptions.tenantId, input.tenantId),
          eq(studentSubscriptions.studentId, input.studentId),
        ),
      )
      .for("update")
      .limit(1);
    if (!sub) return { ok: false, http: 404, error: "Assinatura não encontrada." };
    if (!sub.scheduledPlanId || !sub.scheduledEffectiveAt) {
      return { ok: true, detail: { repeated: true } };
    }
    const key = subscriptionIdempotencyKey(sub.id, sub.scheduledEffectiveAt);
    const [openInvoice] = await tx
      .select({
        id: invoices.id,
        status: invoices.status,
        amountCents: invoices.amountCents,
        gatewayChargeStatus: invoices.gatewayChargeStatus,
      })
      .from(invoices)
      .where(and(eq(invoices.tenantId, input.tenantId), eq(invoices.idempotencyKey, key)))
      .for("update")
      .limit(1);
    if (openInvoice?.status === "paid") {
      return {
        ok: false,
        http: 409,
        error: "A fatura do próximo ciclo já está paga. A desistência não altera fatura paga.",
      };
    }
    if (openInvoice?.gatewayChargeStatus === "pending") {
      return {
        ok: false,
        http: 409,
        error: "A fatura do próximo ciclo está na maquininha sem confirmação.",
      };
    }
    if (openInvoice && openInvoice.status === "open" && openInvoice.amountCents !== sub.priceCents) {
      await tx
        .update(invoices)
        .set({ amountCents: sub.priceCents })
        .where(and(eq(invoices.id, openInvoice.id), eq(invoices.tenantId, input.tenantId)));
    }
    await tx
      .update(studentSubscriptions)
      .set({
        scheduledPlanId: null,
        scheduledPriceCents: null,
        scheduledBillingInterval: null,
        scheduledEffectiveAt: null,
      })
      .where(eq(studentSubscriptions.id, sub.id));
    return { ok: true, detail: { cleared: true } };
  });
}

export async function renewTerm(input: {
  tenantId: string;
  studentId: string;
  subscriptionId: string;
  actorUserId: string;
  endsAt: Date;
  planId?: string;
}): Promise<ActionResult> {
  return withTenantTransaction(input.tenantId, async (tx) => {
    const [sub] = await tx
      .select()
      .from(studentSubscriptions)
      .where(
        and(
          eq(studentSubscriptions.id, input.subscriptionId),
          eq(studentSubscriptions.tenantId, input.tenantId),
          eq(studentSubscriptions.studentId, input.studentId),
        ),
      )
      .for("update")
      .limit(1);
    if (!sub) return { ok: false, http: 404, error: "Assinatura não encontrada." };
    if (sub.cancelRequestedAt) {
      return { ok: false, http: 409, error: "Contrato cancelado não é reativado por renovação." };
    }
    if (!sub.endsAt) {
      return { ok: false, http: 409, error: "Assinatura sem prazo não usa renovação manual." };
    }
    if (input.endsAt.getTime() <= sub.endsAt.getTime()) {
      return { ok: false, http: 409, error: "A nova vigência precisa começar depois do fim atual." };
    }
    const planId = input.planId ?? sub.planId;
    const [plan] = await tx
      .select()
      .from(plans)
      .where(and(eq(plans.id, planId), eq(plans.tenantId, input.tenantId)))
      .limit(1);
    if (!plan) return { ok: false, http: 404, error: "Plano não encontrado." };
    const startsAt = sub.endsAt;
    const existingTerms = await tx
      .select({
        startsAt: subscriptionTerms.startsAt,
        endsAt: subscriptionTerms.endsAt,
      })
      .from(subscriptionTerms)
      .where(eq(subscriptionTerms.subscriptionId, sub.id));
    const overlaps = existingTerms.some((term) => {
      const termEnd = term.endsAt?.getTime() ?? Number.POSITIVE_INFINITY;
      return term.startsAt.getTime() < input.endsAt.getTime() && termEnd > startsAt.getTime();
    });
    if (overlaps) {
      return { ok: false, http: 409, error: "Já existe vigência que cobre esse intervalo." };
    }
    await tx.insert(subscriptionTerms).values({
      tenantId: input.tenantId,
      subscriptionId: sub.id,
      planId: plan.id,
      priceCents: plan.priceCents,
      billingInterval: plan.billingInterval,
      startsAt,
      endsAt: input.endsAt,
      validFrom: startsAt,
      source: "renewal",
      createdBy: input.actorUserId,
    });
    return {
      ok: true,
      detail: {
        startsAt,
        endsAt: input.endsAt,
        priceCents: plan.priceCents,
        currentPriceCents: sub.priceCents,
        currentEndsAt: sub.endsAt,
      },
    };
  });
}

export async function noteBillingReview(
  tenantId: string,
  subscriptionId: string,
  periodKey: string,
  reason: string,
): Promise<void> {
  await withTenantTransaction(tenantId, async (tx) => {
    await tx
      .insert(billingReviews)
      .values({ tenantId, subscriptionId, periodKey, reason: reason.slice(0, 500) })
      .onConflictDoNothing({
        target: [billingReviews.tenantId, billingReviews.periodKey],
      });
  });
}
