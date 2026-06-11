import { createHash } from "crypto";
import { and, eq } from "drizzle-orm";
import {
  accessEvents,
  invoiceTimelineEvents,
  invoices,
  plans,
  studentSubscriptions,
  studentWorkouts,
  students,
  turnstileDevices,
  workoutTemplates,
} from "../src/lib/db/schema";
import { withBypassRlsTransaction } from "../src/lib/db/with-tenant";
import { recalculateStudentStatus } from "../src/lib/services/student-status";

function hashToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(9, 0, 0, 0);
  return d;
}

function subKey(subId: string, dueAt: Date) {
  return `sub:${subId}:${dueAt.toISOString().slice(0, 10)}`;
}

type DemoStudent = {
  fullName: string;
  cpf: string;
  email: string;
  scenario: "active" | "delinquent" | "inactive";
  withWorkout?: boolean;
};

const DEMO_STUDENTS: DemoStudent[] = [
  {
    fullName: "Maria Silva",
    cpf: "52998224725",
    email: "maria.silva@email.com",
    scenario: "active",
    withWorkout: true,
  },
  {
    fullName: "João Gabriel",
    cpf: "11136069917",
    email: "joao.gabriel@email.com",
    scenario: "active",
    withWorkout: true,
  },
  {
    fullName: "Carlos Eduardo",
    cpf: "39053344705",
    email: "carlos@email.com",
    scenario: "delinquent",
  },
  {
    fullName: "Ana Paula Costa",
    cpf: "12345678909",
    email: "ana.costa@email.com",
    scenario: "inactive",
  },
  {
    fullName: "Pedro Santos",
    cpf: "98765432100",
    email: "pedro@email.com",
    scenario: "active",
  },
  {
    fullName: "Juliana Ferreira",
    cpf: "45678912345",
    email: "juliana@email.com",
    scenario: "active",
  },
  {
    fullName: "Ricardo Almeida",
    cpf: "32165498700",
    email: "ricardo@email.com",
    scenario: "delinquent",
  },
  {
    fullName: "Fernanda Lima",
    cpf: "65432198711",
    email: "fernanda@email.com",
    scenario: "active",
    withWorkout: true,
  },
];

export async function seedDemoData(tenantId: string): Promise<void> {
  const force = process.env.FORCE_DEMO_SEED === "1";
  if (!force) {
    let found = 0;
    for (const demo of DEMO_STUDENTS) {
      const exists = await withBypassRlsTransaction(async (tx) => {
        const [s] = await tx
          .select({ id: students.id })
          .from(students)
          .where(and(eq(students.tenantId, tenantId), eq(students.cpf, demo.cpf)))
          .limit(1);
        return !!s;
      });
      if (exists) found++;
    }
    if (found >= DEMO_STUDENTS.length) {
      console.log(`Demo: ${found} alunos de apresentação já existem, skip.`);
      return;
    }
  }

  const [monthlyPlan] = await withBypassRlsTransaction(async (tx) => {
    return tx
      .select()
      .from(plans)
      .where(and(eq(plans.tenantId, tenantId), eq(plans.active, true)))
      .limit(1);
  });

  if (!monthlyPlan) {
    console.log("Demo: nenhum plano ativo — rode seed de planos primeiro.");
    return;
  }

  const [template] = await withBypassRlsTransaction(async (tx) => {
    return tx
      .select()
      .from(workoutTemplates)
      .where(
        and(eq(workoutTemplates.tenantId, tenantId), eq(workoutTemplates.active, true)),
      )
      .limit(1);
  });

  let deviceId: string | null = null;
  await withBypassRlsTransaction(async (tx) => {
    const [existing] = await tx
      .select({ id: turnstileDevices.id })
      .from(turnstileDevices)
      .where(eq(turnstileDevices.tenantId, tenantId))
      .limit(1);
    if (existing) {
      deviceId = existing.id;
      return;
    }
    const tokenHash = hashToken("demo-catraca-token-apresentacao");
    const [d] = await tx
      .insert(turnstileDevices)
      .values({
        tenantId,
        name: "Catraca entrada principal",
        tokenHash,
      })
      .returning({ id: turnstileDevices.id });
    deviceId = d!.id;
    console.log("Demo: dispositivo catraca criado (token: demo-catraca-token-apresentacao)");
  });

  const startsAt = daysAgo(30);

  for (const demo of DEMO_STUDENTS) {
    let studentId: string;

    const existing = await withBypassRlsTransaction(async (tx) => {
      const [s] = await tx
        .select({ id: students.id })
        .from(students)
        .where(and(eq(students.tenantId, tenantId), eq(students.cpf, demo.cpf)))
        .limit(1);
      return s ?? null;
    });

    if (existing) {
      studentId = existing.id;
    } else {
      const [row] = await withBypassRlsTransaction(async (tx) => {
        const [s] = await tx
          .insert(students)
          .values({
            tenantId,
            fullName: demo.fullName,
            cpf: demo.cpf,
            email: demo.email,
            status: "inactive",
          })
          .returning({ id: students.id });
        return [s!];
      });
      studentId = row.id;
    }

    if (demo.scenario === "inactive") {
      await recalculateStudentStatus(tenantId, studentId);
      continue;
    }

    let subId: string;
    const hasSub = await withBypassRlsTransaction(async (tx) => {
      const [s] = await tx
        .select({ id: studentSubscriptions.id })
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

    if (hasSub) {
      subId = hasSub.id;
    } else {
      const [sub] = await withBypassRlsTransaction(async (tx) => {
        const [row] = await tx
          .insert(studentSubscriptions)
          .values({
            tenantId,
            studentId,
            planId: monthlyPlan.id,
            startsAt,
            endsAt: null,
            active: true,
          })
          .returning({ id: studentSubscriptions.id });
        return [row!];
      });
      subId = sub.id;
    }

    const periods =
      demo.scenario === "delinquent"
        ? [
            { dueAt: daysAgo(30), paid: true },
            { dueAt: daysAgo(7), paid: false },
          ]
        : [
            { dueAt: daysAgo(30), paid: true },
            { dueAt: daysAgo(1), paid: true },
          ];

    for (const p of periods) {
      const key = subKey(subId, p.dueAt);
      await withBypassRlsTransaction(async (tx) => {
        const [exists] = await tx
          .select({ id: invoices.id, status: invoices.status })
          .from(invoices)
          .where(
            and(eq(invoices.tenantId, tenantId), eq(invoices.idempotencyKey, key)),
          )
          .limit(1);

        if (exists) {
          if (p.paid && exists.status === "open") {
            await tx
              .update(invoices)
              .set({
                status: "paid",
                paidAt: new Date(),
                settlementSource: "manual_reception",
              })
              .where(eq(invoices.id, exists.id));
          }
          return;
        }

        const [inv] = await tx
          .insert(invoices)
          .values({
            tenantId,
            studentId,
            amountCents: monthlyPlan.priceCents,
            currency: "BRL",
            status: p.paid ? "paid" : "open",
            dueAt: p.dueAt,
            paidAt: p.paid ? p.dueAt : null,
            settlementSource: p.paid ? "manual_reception" : null,
            idempotencyKey: key,
          })
          .returning({ id: invoices.id });

        await tx.insert(invoiceTimelineEvents).values({
          tenantId,
          invoiceId: inv!.id,
          type: p.paid ? "manual_payment" : "note",
          payload: { message: "Dados de demonstração." },
        });
      });
    }

    if (demo.scenario === "active" && deviceId) {
      for (const days of [0, 1, 3, 5, 7]) {
        const at = daysAgo(days);
        if (days === 0) at.setHours(new Date().getHours() - 1);
        await withBypassRlsTransaction(async (tx) => {
          await tx.insert(accessEvents).values({
            tenantId,
            studentId,
            deviceId,
            allowed: true,
            reason: null,
            createdAt: at,
          });
        });
      }
    }

    if (demo.withWorkout && template) {
      const hasWorkout = await withBypassRlsTransaction(async (tx) => {
        const [w] = await tx
          .select({ id: studentWorkouts.id })
          .from(studentWorkouts)
          .where(eq(studentWorkouts.studentId, studentId))
          .limit(1);
        return !!w;
      });
      if (!hasWorkout) {
        await withBypassRlsTransaction(async (tx) => {
          await tx.insert(studentWorkouts).values({
            tenantId,
            studentId,
            templateId: template.id,
            name: template.name,
            exercises: template.exercises,
            notes: "Treino de demonstração.",
          });
        });
      }
    }

    await recalculateStudentStatus(tenantId, studentId);
  }

  console.log(`Demo: ${DEMO_STUDENTS.length} alunos de apresentação preparados.`);
}
