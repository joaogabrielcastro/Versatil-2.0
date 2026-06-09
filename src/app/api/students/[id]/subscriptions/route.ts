import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { logAudit } from "@/lib/audit/log";
import { jsonError } from "@/lib/api/json";
import { getSession } from "@/lib/auth/session";
import { plans, studentSubscriptions, students } from "@/lib/db/schema";
import { withTenantTransaction } from "@/lib/db/with-tenant";
import { createFirstSubscriptionInvoice } from "@/lib/services/billing/subscription-invoice";
import { recalculateStudentStatus } from "@/lib/services/student-status";

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
    return await tx
      .select({
        subscription: studentSubscriptions,
        plan: plans,
      })
      .from(studentSubscriptions)
      .innerJoin(plans, eq(studentSubscriptions.planId, plans.id))
      .where(eq(studentSubscriptions.studentId, studentId))
      .orderBy(desc(studentSubscriptions.createdAt));
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
        })
        .from(plans)
        .where(and(eq(plans.id, body.planId), eq(plans.tenantId, tenantId)))
        .limit(1);
      if (!pl) {
        throw new Error("no_plan");
      }
      const [row] = await tx
        .insert(studentSubscriptions)
        .values({
          tenantId,
          studentId,
          planId: body.planId,
          startsAt,
          endsAt,
          active: true,
        })
        .returning();
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
    throw e;
  }
}
