import { and, count, desc, eq, ilike, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { logAudit } from "@/lib/audit/log";
import { jsonError } from "@/lib/api/json";
import { getSession } from "@/lib/auth/session";
import { students } from "@/lib/db/schema";
import { withTenantTransaction } from "@/lib/db/with-tenant";
import { recalculateStudentStatus } from "@/lib/services/student-status";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  fullName: z.string().min(2).max(255),
  cpf: z.string().min(11).max(14),
  email: z.union([z.string().email(), z.literal("")]).optional(),
  whatsapp: z.string().max(32).optional().nullable(),
  birthDate: z.string().optional().nullable(),
  facialVectorRef: z.string().max(2000).optional().nullable(),
});

export async function GET(request: Request) {
  const session = await getSession();
  if (!session || session.typ !== "tenant" || !session.tid) {
    return jsonError(401, "Não autenticado como equipe da academia.");
  }

  const tenantId = session.tid;

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();

  const limit = Math.min(
    100,
    Math.max(1, Number(searchParams.get("limit") ?? 50) || 50),
  );
  const offset = Math.max(0, Number(searchParams.get("offset") ?? 0) || 0);

  const rows = await withTenantTransaction(tenantId, async (tx) => {
    const pattern = q ? `%${q}%` : null;
    const whereExpr =
      pattern !== null
        ? and(
            eq(students.tenantId, tenantId),
            or(
              ilike(students.fullName, pattern),
              ilike(students.cpf, pattern),
              ilike(students.email, pattern),
            ),
          )
        : eq(students.tenantId, tenantId);

    const [items, [{ total }]] = await Promise.all([
      tx
        .select({
          id: students.id,
          fullName: students.fullName,
          cpf: students.cpf,
          email: students.email,
          whatsapp: students.whatsapp,
          birthDate: students.birthDate,
          status: students.status,
          createdAt: students.createdAt,
        })
        .from(students)
        .where(whereExpr!)
        .orderBy(desc(students.createdAt))
        .limit(limit)
        .offset(offset),
      tx.select({ total: count() }).from(students).where(whereExpr!),
    ]);

    return { items, total: Number(total ?? 0) };
  });

  return NextResponse.json({
    items: rows.items,
    total: rows.total,
    limit,
    offset,
  });
}

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

  const birthDate =
    body.birthDate && body.birthDate.length > 0
      ? new Date(body.birthDate)
      : null;
  if (birthDate && Number.isNaN(birthDate.getTime())) {
    return jsonError(400, "Data de nascimento inválida.");
  }

  const email =
    body.email && body.email.length > 0 ? body.email : null;

  try {
    const [created] = await withTenantTransaction(tenantId, async (tx) => {
      const [row] = await tx
        .insert(students)
        .values({
          tenantId,
          fullName: body.fullName,
          cpf: body.cpf,
          email,
          whatsapp: body.whatsapp ?? null,
          birthDate,
          facialVectorRef: body.facialVectorRef ?? null,
        })
        .returning({
          id: students.id,
          fullName: students.fullName,
          cpf: students.cpf,
          email: students.email,
          status: students.status,
        });
      return [row];
    });
    await recalculateStudentStatus(tenantId, created!.id);
    await logAudit({
      tenantId,
      actorUserId: session.sub,
      action: "student.created",
      entity: "student",
      entityId: created!.id,
      payload: { fullName: body.fullName },
    });
    return NextResponse.json({ student: created }, { status: 201 });
  } catch {
    return jsonError(
      409,
      "Não foi possível criar o aluno (CPF duplicado ou dados inválidos).",
    );
  }
}
