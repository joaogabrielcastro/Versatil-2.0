import { randomBytes } from "crypto";
import { and, asc, eq, gt, gte, inArray, isNull, or } from "drizzle-orm";
import {
  accessEvents,
  auditLogs,
  invoiceTimelineEvents,
  invoices,
  plans,
  studentSubscriptions,
  studentWorkouts,
  students,
} from "@/lib/db/schema";
import type { DbTransaction } from "@/lib/db/with-tenant";

/**
 * Direitos do titular (LGPD art. 18) para alunos.
 *
 * Exportação: tudo o que o sistema guarda sobre o aluno, em JSON legível.
 * Anonimização: remove dados pessoais e treinos (podem conter dados de saúde).
 * Faturas, pagamentos e presença permanecem, desvinculados de identificação,
 * porque registros financeiros têm guarda obrigatória (art. 16, I).
 */

export const ANONYMIZED_NAME = "Aluno anonimizado";
export const ANONYMIZE_CONFIRMATION = "ANONIMIZAR";

export async function exportStudentData(
  tx: DbTransaction,
  tenantId: string,
  studentId: string,
) {
  const [student] = await tx
    .select({
      id: students.id,
      fullName: students.fullName,
      cpf: students.cpf,
      email: students.email,
      whatsapp: students.whatsapp,
      birthDate: students.birthDate,
      status: students.status,
      anonymizedAt: students.anonymizedAt,
      createdAt: students.createdAt,
      updatedAt: students.updatedAt,
    })
    .from(students)
    .where(and(eq(students.id, studentId), eq(students.tenantId, tenantId)))
    .limit(1);
  if (!student) return null;

  const subscriptions = await tx
    .select({
      id: studentSubscriptions.id,
      plan: plans.name,
      priceCents: studentSubscriptions.priceCents,
      billingInterval: studentSubscriptions.billingInterval,
      startsAt: studentSubscriptions.startsAt,
      endsAt: studentSubscriptions.endsAt,
      active: studentSubscriptions.active,
      cancelRequestedAt: studentSubscriptions.cancelRequestedAt,
      cancelEffectiveAt: studentSubscriptions.cancelEffectiveAt,
      cancelReason: studentSubscriptions.cancelReason,
      createdAt: studentSubscriptions.createdAt,
    })
    .from(studentSubscriptions)
    .innerJoin(plans, eq(plans.id, studentSubscriptions.planId))
    .where(
      and(
        eq(studentSubscriptions.tenantId, tenantId),
        eq(studentSubscriptions.studentId, studentId),
      ),
    )
    .orderBy(asc(studentSubscriptions.createdAt));

  const invoiceRows = await tx
    .select({
      id: invoices.id,
      amountCents: invoices.amountCents,
      currency: invoices.currency,
      status: invoices.status,
      purpose: invoices.purpose,
      dueAt: invoices.dueAt,
      paidAt: invoices.paidAt,
      settlementSource: invoices.settlementSource,
      createdAt: invoices.createdAt,
    })
    .from(invoices)
    .where(and(eq(invoices.tenantId, tenantId), eq(invoices.studentId, studentId)))
    .orderBy(asc(invoices.dueAt));

  const accesses = await tx
    .select({
      at: accessEvents.createdAt,
      allowed: accessEvents.allowed,
      reason: accessEvents.reason,
    })
    .from(accessEvents)
    .where(and(eq(accessEvents.tenantId, tenantId), eq(accessEvents.studentId, studentId)))
    .orderBy(asc(accessEvents.createdAt));

  const workouts = await tx
    .select({
      id: studentWorkouts.id,
      name: studentWorkouts.name,
      exercises: studentWorkouts.exercises,
      notes: studentWorkouts.notes,
      createdAt: studentWorkouts.createdAt,
      updatedAt: studentWorkouts.updatedAt,
    })
    .from(studentWorkouts)
    .where(and(eq(studentWorkouts.tenantId, tenantId), eq(studentWorkouts.studentId, studentId)));

  return {
    exportedAt: new Date().toISOString(),
    student,
    subscriptions,
    invoices: invoiceRows,
    accessEvents: accesses,
    workouts,
  };
}

export type AnonymizeResult =
  | { status: "done" }
  | { status: "not_found" }
  | { status: "blocked"; message: string };

export async function anonymizeStudent(
  tx: DbTransaction,
  input: { tenantId: string; studentId: string; now?: Date },
): Promise<AnonymizeResult> {
  const now = input.now ?? new Date();
  const { tenantId, studentId } = input;

  const [student] = await tx
    .select({ id: students.id, anonymizedAt: students.anonymizedAt })
    .from(students)
    .where(and(eq(students.id, studentId), eq(students.tenantId, tenantId)))
    .limit(1)
    .for("update");
  if (!student) return { status: "not_found" };
  if (student.anonymizedAt) {
    return { status: "blocked", message: "Aluno já anonimizado." };
  }

  const [inForce] = await tx
    .select({ id: studentSubscriptions.id })
    .from(studentSubscriptions)
    .where(
      and(
        eq(studentSubscriptions.tenantId, tenantId),
        eq(studentSubscriptions.studentId, studentId),
        eq(studentSubscriptions.active, true),
        or(isNull(studentSubscriptions.endsAt), gte(studentSubscriptions.endsAt, now)),
        or(
          isNull(studentSubscriptions.cancelEffectiveAt),
          gt(studentSubscriptions.cancelEffectiveAt, now),
        ),
      ),
    )
    .limit(1);
  if (inForce) {
    return {
      status: "blocked",
      message: "O aluno tem matrícula vigente. Cancele a matrícula antes de anonimizar.",
    };
  }

  const [openInvoice] = await tx
    .select({ id: invoices.id })
    .from(invoices)
    .where(
      and(
        eq(invoices.tenantId, tenantId),
        eq(invoices.studentId, studentId),
        eq(invoices.status, "open"),
      ),
    )
    .limit(1);
  if (openInvoice) {
    return {
      status: "blocked",
      message: "O aluno tem fatura em aberto. Registre o pagamento ou cancele a fatura antes.",
    };
  }

  const workoutIds = (
    await tx
      .select({ id: studentWorkouts.id })
      .from(studentWorkouts)
      .where(and(eq(studentWorkouts.tenantId, tenantId), eq(studentWorkouts.studentId, studentId)))
  ).map((w) => w.id);

  await tx
    .update(students)
    .set({
      fullName: ANONYMIZED_NAME,
      // CPF é obrigatório e único por academia: marcador aleatório de 14 caracteres.
      cpf: `anon${randomBytes(5).toString("hex")}`,
      email: null,
      whatsapp: null,
      birthDate: null,
      facialVectorRef: null,
      status: "inactive",
      anonymizedAt: now,
      updatedAt: now,
    })
    .where(and(eq(students.id, studentId), eq(students.tenantId, tenantId)));

  await tx
    .update(studentSubscriptions)
    .set({ active: false })
    .where(
      and(
        eq(studentSubscriptions.tenantId, tenantId),
        eq(studentSubscriptions.studentId, studentId),
      ),
    );

  if (workoutIds.length > 0) {
    await tx
      .delete(studentWorkouts)
      .where(and(eq(studentWorkouts.tenantId, tenantId), inArray(studentWorkouts.id, workoutIds)));
  }

  // Registros antigos da auditoria podem ter gravado dados pessoais no payload.
  const entityIds = [studentId, ...workoutIds];
  await tx
    .update(auditLogs)
    .set({ payload: { redacted: "lgpd_anonymization" } })
    .where(and(eq(auditLogs.tenantId, tenantId), inArray(auditLogs.entityId, entityIds)));

  // Notas livres na linha do tempo das faturas podem citar o aluno; valores e datas ficam.
  const invoiceIds = (
    await tx
      .select({ id: invoices.id })
      .from(invoices)
      .where(and(eq(invoices.tenantId, tenantId), eq(invoices.studentId, studentId)))
  ).map((i) => i.id);
  if (invoiceIds.length > 0) {
    const events = await tx
      .select({ id: invoiceTimelineEvents.id, payload: invoiceTimelineEvents.payload })
      .from(invoiceTimelineEvents)
      .where(
        and(
          eq(invoiceTimelineEvents.tenantId, tenantId),
          inArray(invoiceTimelineEvents.invoiceId, invoiceIds),
        ),
      );
    for (const ev of events) {
      const p = (ev.payload ?? {}) as Record<string, unknown>;
      const freeText = ["note", "reason"].filter(
        (key) => typeof p[key] === "string" && p[key],
      );
      if (freeText.length === 0) continue;
      const cleaned = { ...p };
      for (const key of freeText) cleaned[key] = "[removido — LGPD]";
      await tx
        .update(invoiceTimelineEvents)
        .set({ payload: cleaned })
        .where(eq(invoiceTimelineEvents.id, ev.id));
    }
  }

  return { status: "done" };
}
