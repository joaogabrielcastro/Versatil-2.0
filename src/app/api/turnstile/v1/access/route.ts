import { createHash } from "crypto";
import { eq, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { accessEvents, students, turnstileDevices } from "@/lib/db/schema";
import { getQueue } from "@/lib/queues/bull";
import { getEnv } from "@/lib/env";
import {
  onlyDigits,
  tecnofitCodeRef,
} from "@/lib/students/external-ref";
import { withBypassRlsTransaction, withTenantTransaction } from "@/lib/db/with-tenant";

export const dynamic = "force-dynamic";

/**
 * Identificação do aluno (pelo menos um):
 * - studentId: UUID do Versátil
 * - studentCode / codigo: COD Tecnofit (ex.: "76126")
 * - cpf: CPF com ou sem máscara
 */
const bodySchema = z
  .object({
    studentId: z.string().uuid().optional(),
    studentCode: z.string().min(1).max(64).optional(),
    codigo: z.string().min(1).max(64).optional(),
    cpf: z.string().min(11).max(18).optional(),
  })
  .refine(
    (b) => Boolean(b.studentId || b.studentCode || b.codigo || b.cpf),
    { message: "Informe studentId, studentCode (ou codigo) ou cpf." },
  );

function hashToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/**
 * Validação inbound da catraca: header `x-tenant-device-token` identifica o aparelho.
 * Regras de status: ativo → 200; inadimplente/inativo → 403 com motivo.
 */
export async function POST(request: Request) {
  const token = request.headers.get("x-tenant-device-token");
  if (!token) {
    return NextResponse.json(
      { error: "Token do dispositivo ausente (x-tenant-device-token)." },
      { status: 401 },
    );
  }

  const tokenHash = hashToken(token);
  const device = await withBypassRlsTransaction(async (tx) => {
    const [d] = await tx
      .select({
        id: turnstileDevices.id,
        tenantId: turnstileDevices.tenantId,
      })
      .from(turnstileDevices)
      .where(eq(turnstileDevices.tokenHash, tokenHash))
      .limit(1);
    return d ?? null;
  });

  if (!device) {
    return NextResponse.json({ error: "Dispositivo não autorizado." }, { status: 401 });
  }

  await withBypassRlsTransaction(async (tx) => {
    await tx
      .update(turnstileDevices)
      .set({ lastSeenAt: new Date() })
      .where(eq(turnstileDevices.id, device.id));
  });

  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(await request.json());
  } catch {
    return NextResponse.json(
      {
        error:
          "JSON inválido. Informe studentId (UUID), studentCode/codigo (COD Tecnofit) ou cpf.",
      },
      { status: 400 },
    );
  }

  const codeRaw = (parsed.studentCode ?? parsed.codigo)?.trim();
  const cpfDigits = parsed.cpf ? onlyDigits(parsed.cpf) : "";

  const result = await withTenantTransaction(device.tenantId, async (tx) => {
    let student: { id: string; status: string } | null = null;

    if (parsed.studentId) {
      const [row] = await tx
        .select({ id: students.id, status: students.status })
        .from(students)
        .where(eq(students.id, parsed.studentId))
        .limit(1);
      student = row ?? null;
    } else if (codeRaw) {
      const digits = onlyDigits(codeRaw) || codeRaw;
      const ref = tecnofitCodeRef(codeRaw);
      const [row] = await tx
        .select({ id: students.id, status: students.status })
        .from(students)
        .where(
          or(
            eq(students.facialVectorRef, ref),
            eq(students.facialVectorRef, digits),
            eq(students.facialVectorRef, codeRaw),
          ),
        )
        .limit(1);
      student = row ?? null;
    } else if (cpfDigits.length >= 11) {
      const [row] = await tx
        .select({ id: students.id, status: students.status })
        .from(students)
        .where(eq(students.cpf, cpfDigits))
        .limit(1);
      student = row ?? null;
    }

    if (!student) {
      await tx.insert(accessEvents).values({
        tenantId: device.tenantId,
        studentId: null,
        deviceId: device.id,
        allowed: false,
        reason: "student_not_found",
      });
      return { allowed: false as const, reason: "Aluno não encontrado." };
    }

    if (student.status === "active") {
      const [ev] = await tx
        .insert(accessEvents)
        .values({
          tenantId: device.tenantId,
          studentId: student.id,
          deviceId: device.id,
          allowed: true,
          reason: null,
        })
        .returning({ id: accessEvents.id });
      return {
        allowed: true as const,
        reason: null,
        accessEventId: ev!.id,
        studentId: student.id,
        deviceId: device.id,
      };
    }

    const reason =
      student.status === "delinquent" ? "inadimplente" : "inativo";
    await tx.insert(accessEvents).values({
      tenantId: device.tenantId,
      studentId: student.id,
      deviceId: device.id,
      allowed: false,
      reason,
    });
    return {
      allowed: false as const,
      reason:
        student.status === "delinquent"
          ? "Aluno inadimplente."
          : "Aluno inativo.",
    };
  });

  if (result.allowed && "accessEventId" in result && getEnv().TURNSTILE_PUSH_URL) {
    await getQueue("turnstileSync").add(
      "access",
      {
        tenantId: device.tenantId,
        studentId: result.studentId,
        deviceId: result.deviceId,
        allowed: true,
        reason: null,
        accessEventId: result.accessEventId,
      },
      { removeOnComplete: 100, removeOnFail: 40 },
    );
  }

  if (result.allowed) {
    return NextResponse.json({ open: true });
  }
  return NextResponse.json(
    { open: false, message: result.reason },
    { status: 403 },
  );
}
