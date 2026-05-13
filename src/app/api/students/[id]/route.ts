import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { logAudit } from "@/lib/audit/log";
import { jsonError } from "@/lib/api/json";
import { getSession } from "@/lib/auth/session";
import { students } from "@/lib/db/schema";
import { withTenantTransaction } from "@/lib/db/with-tenant";
import { recalculateStudentStatus } from "@/lib/services/student-status";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  fullName: z.string().min(2).max(255).optional(),
  email: z.union([z.string().email(), z.literal("")]).optional(),
  whatsapp: z.string().max(32).optional().nullable(),
  birthDate: z.string().optional().nullable(),
  facialVectorRef: z.string().max(2000).optional().nullable(),
});

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session || session.typ !== "tenant" || !session.tid) {
    return jsonError(401, "Não autenticado como equipe da academia.");
  }
  const tenantId = session.tid;
  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) {
    return jsonError(400, "ID inválido.");
  }

  const row = await withTenantTransaction(tenantId, async (tx) => {
    const [r] = await tx
      .select()
      .from(students)
      .where(and(eq(students.id, id), eq(students.tenantId, tenantId)))
      .limit(1);
    return r ?? null;
  });

  if (!row) {
    return jsonError(404, "Aluno não encontrado.");
  }
  return NextResponse.json({ student: row });
}

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session || session.typ !== "tenant" || !session.tid) {
    return jsonError(401, "Não autenticado como equipe da academia.");
  }
  const tenantId = session.tid;
  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) {
    return jsonError(400, "ID inválido.");
  }

  let body: z.infer<typeof patchSchema>;
  try {
    body = patchSchema.parse(await request.json());
  } catch {
    return jsonError(400, "Payload inválido.");
  }

  const birthDate =
    body.birthDate === undefined
      ? undefined
      : body.birthDate && body.birthDate.length > 0
        ? new Date(body.birthDate)
        : null;
  if (birthDate && Number.isNaN(birthDate.getTime())) {
    return jsonError(400, "Data de nascimento inválida.");
  }

  const email =
    body.email === undefined
      ? undefined
      : body.email && body.email.length > 0
        ? body.email
        : null;

  const updated = await withTenantTransaction(tenantId, async (tx) => {
    const [existing] = await tx
      .select({ id: students.id })
      .from(students)
      .where(and(eq(students.id, id), eq(students.tenantId, tenantId)))
      .limit(1);
    if (!existing) {
      return null;
    }

    const patch: {
      updatedAt: Date;
      fullName?: string;
      email?: string | null;
      whatsapp?: string | null;
      birthDate?: Date | null;
      facialVectorRef?: string | null;
    } = {
      updatedAt: new Date(),
    };
    if (body.fullName !== undefined) patch.fullName = body.fullName;
    if (email !== undefined) patch.email = email;
    if (body.whatsapp !== undefined) patch.whatsapp = body.whatsapp;
    if (birthDate !== undefined) patch.birthDate = birthDate;
    if (body.facialVectorRef !== undefined) {
      patch.facialVectorRef = body.facialVectorRef;
    }

    const [row] = await tx
      .update(students)
      .set(patch)
      .where(eq(students.id, id))
      .returning();
    return row ?? null;
  });

  if (!updated) {
    return jsonError(404, "Aluno não encontrado.");
  }

  await recalculateStudentStatus(tenantId, id);

  await logAudit({
    tenantId,
    actorUserId: session.sub,
    action: "student.updated",
    entity: "student",
    entityId: id,
    payload: body,
  });

  return NextResponse.json({ student: updated });
}
