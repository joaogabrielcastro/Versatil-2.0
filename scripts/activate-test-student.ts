/**
 * Ativa aluno de teste (plano + fatura paga) e testa API da catraca.
 * Uso: npx tsx scripts/activate-test-student.ts
 */
import "dotenv/config";
import { createHash, randomBytes } from "crypto";
import { and, eq, ilike, or } from "drizzle-orm";
import {
  invoiceTimelineEvents,
  invoices,
  plans,
  studentSubscriptions,
  students,
  tenants,
  turnstileDevices,
} from "../src/lib/db/schema";
import { withBypassRlsTransaction } from "../src/lib/db/with-tenant";
import { getEnv } from "../src/lib/env";
import { recalculateStudentStatus } from "../src/lib/services/student-status";

const CPF = "11136069917";
const BASE = process.env.APP_URL ?? "http://127.0.0.1:3000";

function hashToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function idempotencyKey(subscriptionId: string, dueAt: Date) {
  return `sub:${subscriptionId}:${dueAt.toISOString().slice(0, 10)}`;
}

async function main() {
  getEnv();

  const student = await withBypassRlsTransaction(async (tx) => {
    const [row] = await tx
      .select({
        id: students.id,
        fullName: students.fullName,
        cpf: students.cpf,
        status: students.status,
        tenantId: students.tenantId,
        tenantSlug: tenants.slug,
      })
      .from(students)
      .innerJoin(tenants, eq(tenants.id, students.tenantId))
      .where(
        or(
          eq(students.cpf, CPF),
          ilike(students.fullName, "%João Gabriel%"),
          ilike(students.fullName, "%Joao Gabriel%"),
        ),
      )
      .limit(1);
    return row ?? null;
  });

  if (!student) {
    console.error("Aluno não encontrado (CPF", CPF, ").");
    process.exit(1);
  }

  console.log("Aluno:", student.fullName, "| status atual:", student.status);

  const { tenantId, id: studentId } = student;

  const plan = await withBypassRlsTransaction(async (tx) => {
    const [p] = await tx
      .select()
      .from(plans)
      .where(and(eq(plans.tenantId, tenantId), eq(plans.active, true)))
      .limit(1);
    return p ?? null;
  });

  if (!plan) {
    console.error("Nenhum plano ativo no tenant. Rode npm run pilot:setup");
    process.exit(1);
  }

  let sub = await withBypassRlsTransaction(async (tx) => {
    const [s] = await tx
      .select()
      .from(studentSubscriptions)
      .where(
        and(
          eq(studentSubscriptions.studentId, studentId),
          eq(studentSubscriptions.active, true),
        ),
      )
      .limit(1);
    return s ?? null;
  });

  if (!sub) {
    const startsAt = new Date();
    startsAt.setHours(0, 0, 0, 0);
    sub = await withBypassRlsTransaction(async (tx) => {
      const [row] = await tx
        .insert(studentSubscriptions)
        .values({
          tenantId,
          studentId,
          planId: plan.id,
          startsAt,
          endsAt: null,
          active: true,
        })
        .returning();
      return row!;
    });

    const key = idempotencyKey(sub.id, startsAt);
    await withBypassRlsTransaction(async (tx) => {
      const [exists] = await tx
        .select({ id: invoices.id })
        .from(invoices)
        .where(
          and(eq(invoices.tenantId, tenantId), eq(invoices.idempotencyKey, key)),
        )
        .limit(1);
      if (exists) return;
      const [inv] = await tx
        .insert(invoices)
        .values({
          tenantId,
          studentId,
          amountCents: plan.priceCents,
          currency: "BRL",
          status: "open",
          dueAt: startsAt,
          idempotencyKey: key,
        })
        .returning({ id: invoices.id });
      await tx.insert(invoiceTimelineEvents).values({
        tenantId,
        invoiceId: inv!.id,
        type: "note",
        payload: { message: "Primeira fatura (script teste)." },
      });
    });
    console.log("Assinatura criada + primeira fatura.");
  } else {
    console.log("Assinatura já existia.");
  }

  const openInvoices = await withBypassRlsTransaction(async (tx) => {
    return tx
      .select({ id: invoices.id })
      .from(invoices)
      .where(
        and(eq(invoices.studentId, studentId), eq(invoices.status, "open")),
      );
  });

  const now = new Date();
  for (const inv of openInvoices) {
    await withBypassRlsTransaction(async (tx) => {
      await tx
        .update(invoices)
        .set({
          status: "paid",
          paidAt: now,
          settlementSource: "manual_reception",
        })
        .where(eq(invoices.id, inv.id));
    });
    console.log("Fatura paga:", inv.id.slice(0, 8) + "…");
  }

  if (openInvoices.length === 0) {
    console.log("Nenhuma fatura em aberto (já estava ok).");
  }

  const newStatus = await recalculateStudentStatus(tenantId, studentId);
  console.log("Novo status:", newStatus);

  const deviceToken = randomBytes(32).toString("hex");
  const tokenHash = hashToken(deviceToken);

  await withBypassRlsTransaction(async (tx) => {
    await tx.insert(turnstileDevices).values({
      tenantId,
      name: `Catraca teste ${new Date().toISOString().slice(0, 16)}`,
      tokenHash,
    });
  });
  console.log("\n--- Token da catraca (teste) ---");
  console.log(deviceToken);

  const accessRes = await fetch(`${BASE}/api/turnstile/v1/access`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-tenant-device-token": deviceToken,
    },
    body: JSON.stringify({ studentId }),
  });
  const accessBody = await accessRes.json().catch(() => ({}));

  console.log("\n--- Teste catraca ---");
  console.log("POST /api/turnstile/v1/access");
  console.log("studentId:", studentId);
  console.log("HTTP", accessRes.status, JSON.stringify(accessBody));

  console.log("\nFicha do aluno:", `${BASE}/balcao/alunos/${studentId}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
