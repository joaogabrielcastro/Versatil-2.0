import { createHash } from "crypto";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { accessEvents, students, turnstileDevices } from "@/lib/db/schema";
import { getQueue } from "@/lib/queues/bull";
import { getEnv } from "@/lib/env";
import { withBypassRlsTransaction, withTenantTransaction } from "@/lib/db/with-tenant";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  studentId: z.string().uuid(),
});

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

  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const result = await withTenantTransaction(device.tenantId, async (tx) => {
    const [student] = await tx
      .select({
        id: students.id,
        status: students.status,
      })
      .from(students)
      .where(eq(students.id, parsed.studentId))
      .limit(1);

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
