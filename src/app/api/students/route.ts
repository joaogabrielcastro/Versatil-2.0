import { NextResponse } from "next/server";
import { z } from "zod";
import { logAudit } from "@/lib/audit/log";
import { jsonError } from "@/lib/api/json";
import { getSession } from "@/lib/auth/session";
import { cpfRejectionMessage, parseCpfInput } from "@/lib/cpf";
import { students } from "@/lib/db/schema";
import { withTenantTransaction } from "@/lib/db/with-tenant";
import { listStudentsPage } from "@/lib/services/student-effective-status";
import { recalculateStudentStatus } from "@/lib/services/student-status";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  fullName: z.string().min(2).max(255),
  cpf: z.string().max(32),
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
  const statusParam = searchParams.get("status")?.trim() ?? "";
  const statusFilter =
    statusParam === "active" ||
    statusParam === "delinquent" ||
    statusParam === "inactive"
      ? statusParam
      : null;

  const limit = Math.min(
    100,
    Math.max(1, Number(searchParams.get("limit") ?? 50) || 50),
  );
  const offset = Math.max(0, Number(searchParams.get("offset") ?? 0) || 0);

  const rows = await withTenantTransaction(tenantId, (tx) =>
    listStudentsPage(tx, tenantId, {
      q,
      status: statusFilter,
      limit,
      offset,
    }),
  );

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

  const cpfMessage = cpfRejectionMessage(body.cpf);
  if (cpfMessage) {
    return jsonError(400, cpfMessage);
  }
  const cpf = parseCpfInput(body.cpf)!;

  try {
    const [created] = await withTenantTransaction(tenantId, async (tx) => {
      const [row] = await tx
        .insert(students)
        .values({
          tenantId,
          fullName: body.fullName,
          cpf,
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
