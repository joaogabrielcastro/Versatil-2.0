import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
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
  idempotencyKey: z.string().max(255).optional(),
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
    const invoice = await withTenantTransaction(tenantId, async (tx) => {
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

      const [inv] = await tx
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
        })
        .returning({
          id: invoices.id,
          studentId: invoices.studentId,
          amountCents: invoices.amountCents,
          currency: invoices.currency,
          status: invoices.status,
          dueAt: invoices.dueAt,
        });

      await tx.insert(invoiceTimelineEvents).values({
        tenantId,
        invoiceId: inv!.id,
        type: "note",
        payload: { message: "Fatura criada (manual ou sistema)." },
      });

      return inv!;
    });

    await recalculateStudentStatus(tenantId, body.studentId);

    return NextResponse.json({ invoice }, { status: 201 });
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
