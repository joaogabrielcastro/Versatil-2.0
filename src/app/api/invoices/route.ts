import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { logAudit } from "@/lib/audit/log";
import { jsonError } from "@/lib/api/json";
import { getSession } from "@/lib/auth/session";
import {
  invoiceTimelineEvents,
  invoices,
  students,
} from "@/lib/db/schema";
import { withTenantTransaction } from "@/lib/db/with-tenant";
import { recalculateStudentStatus } from "@/lib/services/student-status";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  studentId: z.string().uuid(),
  amountCents: z.number().int().positive(),
  dueAt: z.string().min(1),
  currency: z.string().length(3).optional(),
  externalId: z.string().max(255).optional(),
  idempotencyKey: z.string().trim().min(8).max(255).optional(),
  note: z.string().trim().min(1).max(500).optional(),
  purpose: z.enum(["subscription", "fee", "manual"]).optional(),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session || session.typ !== "tenant" || !session.tid) {
    return jsonError(401, "Não autenticado como equipe da academia.");
  }
  const tenantId = session.tid;

  let body: z.infer<typeof createSchema>;
  try {
    body = createSchema.parse(await request.json());
  } catch {
    return jsonError(400, "Payload inválido.");
  }

  const dueAt = new Date(body.dueAt);
  if (Number.isNaN(dueAt.getTime())) {
    return jsonError(400, "dueAt inválido.");
  }

  try {
    const result = await withTenantTransaction(tenantId, async (tx) => {
      const [stu] = await tx
        .select({ id: students.id })
        .from(students)
        .where(
          and(eq(students.id, body.studentId), eq(students.tenantId, tenantId)),
        )
        .limit(1);
      if (!stu) {
        throw new Error("student_not_found");
      }

      if (body.idempotencyKey) {
        const [existing] = await tx
          .select({
            id: invoices.id,
            studentId: invoices.studentId,
            amountCents: invoices.amountCents,
            currency: invoices.currency,
            status: invoices.status,
            dueAt: invoices.dueAt,
            purpose: invoices.purpose,
          })
          .from(invoices)
          .where(
            and(
              eq(invoices.tenantId, tenantId),
              eq(invoices.idempotencyKey, body.idempotencyKey),
            ),
          )
          .limit(1);
        if (existing) return { invoice: existing, repeated: true };
      }

      const inserted = await tx
        .insert(invoices)
        .values({
          tenantId,
          studentId: body.studentId,
          amountCents: body.amountCents,
          currency: body.currency ?? "BRL",
          status: "open",
          dueAt,
          externalId: body.externalId ?? null,
          idempotencyKey: body.idempotencyKey ?? null,
          purpose: body.purpose ?? "manual",
        })
        .onConflictDoNothing({
          target: [invoices.tenantId, invoices.idempotencyKey],
        })
        .returning({
          id: invoices.id,
          studentId: invoices.studentId,
          amountCents: invoices.amountCents,
          currency: invoices.currency,
          status: invoices.status,
          dueAt: invoices.dueAt,
          purpose: invoices.purpose,
        });

      const inv = inserted[0];
      if (!inv) {
        if (!body.idempotencyKey) throw new Error("duplicate");
        const [race] = await tx
          .select({
            id: invoices.id,
            studentId: invoices.studentId,
            amountCents: invoices.amountCents,
            currency: invoices.currency,
            status: invoices.status,
            dueAt: invoices.dueAt,
            purpose: invoices.purpose,
          })
          .from(invoices)
          .where(
            and(
              eq(invoices.tenantId, tenantId),
              eq(invoices.idempotencyKey, body.idempotencyKey),
            ),
          )
          .limit(1);
        if (!race) throw new Error("duplicate");
        return { invoice: race, repeated: true };
      }

      await tx.insert(invoiceTimelineEvents).values({
        tenantId,
        invoiceId: inv.id,
        type: "note",
        payload: {
          message: body.note ?? "Fatura criada (manual ou sistema).",
        },
      });

      return { invoice: inv, repeated: false };
    });

    await recalculateStudentStatus(tenantId, body.studentId);

    if (!result.repeated) {
      await logAudit({
        tenantId,
        actorUserId: session.sub,
        action: "invoice.created",
        entity: "invoice",
        entityId: result.invoice.id,
        payload: {
          studentId: body.studentId,
          amountCents: body.amountCents,
          purpose: body.purpose ?? "manual",
        },
      });
    }

    return NextResponse.json(
      { invoice: result.invoice, repeated: result.repeated },
      { status: result.repeated ? 200 : 201 },
    );
  } catch (e) {
    if (e instanceof Error && e.message === "student_not_found") {
      return jsonError(404, "Aluno não encontrado.");
    }
    return jsonError(
      409,
      "Não foi possível criar a fatura (duplicidade ou dados inválidos).",
    );
  }
}
