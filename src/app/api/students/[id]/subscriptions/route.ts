import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { logAudit } from "@/lib/audit/log";
import { jsonError } from "@/lib/api/json";
import { getSession } from "@/lib/auth/session";
import { plans, studentSubscriptions, students, subscriptionTerms } from "@/lib/db/schema";
import { withTenantTransaction } from "@/lib/db/with-tenant";
import { isBillingInterval } from "@/lib/billing/interval-labels";
import { suggestedSubscriptionEnd } from "@/lib/billing/term-end";
import { createFirstSubscriptionInvoice } from "@/lib/services/billing/subscription-invoice";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  planId: z.string().uuid(),
  startsAt: z.string().min(1),
  endsAt: z.string().optional().nullable(),
});

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session || session.typ !== "tenant" || !session.tid) {
    return jsonError(401, "Não autenticado.");
  }
  const tenantId = session.tid;
  const { id: studentId } = await ctx.params;
  if (!z.string().uuid().safeParse(studentId).success) {
    return jsonError(400, "ID inválido.");
  }

  const items = await withTenantTransaction(tenantId, async (tx) => {
    const [stu] = await tx
      .select({ id: students.id })
      .from(students)
      .where(and(eq(students.id, studentId), eq(students.tenantId, tenantId)))
      .limit(1);
    if (!stu) return null;
    const rows = await tx
      .select({
        subscription: studentSubscriptions,
        plan: plans,
      })
      .from(studentSubscriptions)
      .innerJoin(plans, eq(studentSubscriptions.planId, plans.id))
      .where(eq(studentSubscriptions.studentId, studentId))
      .orderBy(desc(studentSubscriptions.createdAt));
    const ids = rows.map((row) => row.subscription.id);
    const terms =
      ids.length === 0
        ? []
        : await tx
            .select()
            .from(subscriptionTerms)
            .where(
              and(
                eq(subscriptionTerms.tenantId, tenantId),
                inArray(subscriptionTerms.subscriptionId, ids),
              ),
            )
            .orderBy(asc(subscriptionTerms.startsAt));
    return rows.map((row) => ({
      ...row,
      terms: terms.filter((term) => term.subscriptionId === row.subscription.id),
    }));
  });

  if (!items) {
    return jsonError(404, "Aluno não encontrado.");
  }
  return NextResponse.json({ items });
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session || session.typ !== "tenant" || !session.tid) {
    return jsonError(401, "Não autenticado.");
  }
  const tenantId = session.tid;
  const { id: studentId } = await ctx.params;
  if (!z.string().uuid().safeParse(studentId).success) {
    return jsonError(400, "ID inválido.");
  }

  let body: z.infer<typeof createSchema>;
  try {
    body = createSchema.parse(await request.json());
  } catch {
    return jsonError(400, "Payload inválido.");
  }

  const startsAt = new Date(body.startsAt);
  if (Number.isNaN(startsAt.getTime())) {
    return jsonError(400, "startsAt inválido.");
  }
  const endsAt =
    body.endsAt && body.endsAt.length > 0 ? new Date(body.endsAt) : null;
  if (endsAt && Number.isNaN(endsAt.getTime())) {
    return jsonError(400, "endsAt inválido.");
  }

  try {
    const [sub, plan] = await withTenantTransaction(tenantId, async (tx) => {
      const [stu] = await tx
        .select({ id: students.id })
        .from(students)
        .where(and(eq(students.id, studentId), eq(students.tenantId, tenantId)))
        .limit(1);
      if (!stu) {
        throw new Error("no_student");
      }
      const [pl] = await tx
        .select({
          id: plans.id,
          priceCents: plans.priceCents,
          billingInterval: plans.billingInterval,
          kind: plans.kind,
          termMonths: plans.termMonths,
        })
        .from(plans)
        .where(and(eq(plans.id, body.planId), eq(plans.tenantId, tenantId)))
        .limit(1);
      if (!pl) {
        throw new Error("no_plan");
      }
      if (pl.kind === "fee") {
        throw new Error("fee_plan");
      }
      if (!isBillingInterval(pl.billingInterval)) {
        throw new Error("bad_interval");
      }
      const resolvedEnds =
        endsAt ??
        suggestedSubscriptionEnd(startsAt, pl.billingInterval, pl.termMonths);
      const [row] = await tx
        .insert(studentSubscriptions)
        .values({
          tenantId,
          studentId,
          planId: body.planId,
          startsAt,
          endsAt: resolvedEnds,
          active: true,
          priceCents: pl.priceCents,
          billingInterval: pl.billingInterval,
        })
        .returning();
      await tx.insert(subscriptionTerms).values({
        tenantId,
        subscriptionId: row!.id,
        planId: pl.id,
        priceCents: pl.priceCents,
        billingInterval: pl.billingInterval,
        startsAt,
        endsAt: resolvedEnds,
        validFrom: startsAt,
        source: "contract",
      });
      return [row, pl] as const;
    });

    await createFirstSubscriptionInvoice(
      tenantId,
      studentId,
      sub!.id,
      plan!,
      startsAt,
    );

    await logAudit({
      tenantId,
      actorUserId: session.sub,
      action: "subscription.created",
      entity: "student_subscription",
      entityId: sub!.id,
      payload: { studentId, planId: body.planId },
    });

    return NextResponse.json({ subscription: sub }, { status: 201 });
  } catch (e) {
    if (e instanceof Error && e.message === "no_student") {
      return jsonError(404, "Aluno não encontrado.");
    }
    if (e instanceof Error && e.message === "no_plan") {
      return jsonError(404, "Plano não encontrado.");
    }
    if (e instanceof Error && e.message === "fee_plan") {
      return jsonError(
        400,
        "Taxa avulsa não vira assinatura. Lance a cobrança na ficha do aluno.",
      );
    }
    if (e instanceof Error && e.message === "bad_interval") {
      return jsonError(400, "Intervalo de cobrança do plano é inválido.");
    }
    throw e;
  }
}
