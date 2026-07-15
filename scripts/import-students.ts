import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { and, count, eq } from "drizzle-orm";
import { hashPassword } from "../src/lib/auth/password";
import {
  invoiceTimelineEvents,
  invoices,
  plans,
  studentSubscriptions,
  students,
  tenantUsers,
  tenants,
  workoutTemplates,
} from "../src/lib/db/schema";
import { withBypassRlsTransaction } from "../src/lib/db/with-tenant";
import { recalculateStudentStatus } from "../src/lib/services/student-status";
import { DEFAULT_WORKOUT_PRESETS } from "../src/lib/workouts/presets";

type ImportStudent = {
  codigo?: string;
  fullName: string;
  cpf: string;
  email: string | null;
  whatsapp: string | null;
  valorCents: number | null;
  startsAt: string | null; // "yyyy-mm-dd"
  dueAt: string | null; // "yyyy-mm-dd"
};

const TENANT_SLUG = process.env.IMPORT_TENANT_SLUG ?? "demo";
const TENANT_NAME = process.env.IMPORT_TENANT_NAME ?? "Versátil Academia";
const CREATE_TENANT = process.env.IMPORT_CREATE_TENANT === "1";
const ADMIN_EMAIL = (
  process.env.IMPORT_ADMIN_EMAIL ?? `recep@${TENANT_SLUG}.com`
).toLowerCase();
const ADMIN_PASSWORD = process.env.IMPORT_ADMIN_PASSWORD ?? "versatil12345678";
const WITH_BILLING = process.env.IMPORT_WITH_BILLING !== "0"; // padrão: ligado
const DRY_RUN = process.env.IMPORT_DRY_RUN === "1";
const DATA_FILE =
  process.env.IMPORT_FILE ??
  path.join(process.cwd(), "scripts", "data", "alunos-versatil.json");

function startOfDay(iso: string): Date {
  return new Date(`${iso}T00:00:00`);
}
function endOfDay(iso: string): Date {
  return new Date(`${iso}T23:59:59`);
}

async function bootstrapTenant(): Promise<{ id: string; name: string }> {
  const passwordHash = await hashPassword(ADMIN_PASSWORD);
  return withBypassRlsTransaction(async (tx) => {
    const [t] = await tx
      .insert(tenants)
      .values({ name: TENANT_NAME, slug: TENANT_SLUG })
      .returning({ id: tenants.id, name: tenants.name });
    const tenantId = t!.id;
    console.log(`Tenant criado: ${TENANT_NAME} (slug ${TENANT_SLUG})`);

    await tx.insert(tenantUsers).values({
      tenantId,
      email: ADMIN_EMAIL,
      passwordHash,
      role: "tenant_admin",
    });
    console.log(`Admin criado: ${ADMIN_EMAIL} (senha: ${ADMIN_PASSWORD})`);

    const [{ n: presetCount }] = await tx
      .select({ n: count() })
      .from(workoutTemplates)
      .where(eq(workoutTemplates.tenantId, tenantId));
    if (Number(presetCount ?? 0) === 0) {
      await tx.insert(workoutTemplates).values(
        DEFAULT_WORKOUT_PRESETS.map((p) => ({
          tenantId,
          name: p.name,
          description: p.description,
          exercises: p.exercises,
          isPreset: true,
          active: true,
          sortOrder: p.sortOrder,
        })),
      );
      console.log(`Modelos de treino criados (${DEFAULT_WORKOUT_PRESETS.length}).`);
    }

    return { id: tenantId, name: t!.name };
  });
}

async function main() {
  if (!fs.existsSync(DATA_FILE)) {
    throw new Error(
      `Arquivo de dados não encontrado: ${DATA_FILE}\nGere com: node scripts/parse-tecnofit-report.mjs "<arquivo.xls>" --json ${DATA_FILE}`,
    );
  }

  const list = JSON.parse(fs.readFileSync(DATA_FILE, "utf8")) as ImportStudent[];
  console.log(
    `Importando ${list.length} alunos → tenant "${TENANT_SLUG}" | cobrança: ${
      WITH_BILLING ? "sim" : "não"
    }${DRY_RUN ? " | DRY-RUN (nada será gravado)" : ""}`,
  );

  let tenant = await withBypassRlsTransaction(async (tx) => {
    const [t] = await tx
      .select({ id: tenants.id, name: tenants.name })
      .from(tenants)
      .where(eq(tenants.slug, TENANT_SLUG))
      .limit(1);
    return t ?? null;
  });

  if (!tenant) {
    if (!CREATE_TENANT) {
      throw new Error(
        `Tenant "${TENANT_SLUG}" não existe. Rode com IMPORT_CREATE_TENANT=1 para criar, ou ajuste IMPORT_TENANT_SLUG.`,
      );
    }
    if (DRY_RUN) {
      console.log(
        `[dry-run] Criaria tenant "${TENANT_NAME}" (slug ${TENANT_SLUG}) + admin ${ADMIN_EMAIL} + ${DEFAULT_WORKOUT_PRESETS.length} modelos.`,
      );
    } else {
      tenant = await bootstrapTenant();
    }
  }

  if (!tenant) {
    // só ocorre em dry-run de criação de tenant
    console.log("[dry-run] encerrando (tenant seria criado agora).");
    return;
  }

  const tenantId = tenant.id;
  console.log(`Tenant: ${tenant.name} (${tenantId})`);

  // Plano usado para vincular assinaturas (o valor real vai na fatura de cada aluno).
  let planId: string | null = null;
  if (WITH_BILLING) {
    planId = await withBypassRlsTransaction(async (tx) => {
      const [existing] = await tx
        .select({ id: plans.id })
        .from(plans)
        .where(and(eq(plans.tenantId, tenantId), eq(plans.active, true)))
        .limit(1);
      if (existing) return existing.id;
      if (DRY_RUN) return "dry-run-plan";
      const [created] = await tx
        .insert(plans)
        .values({
          tenantId,
          name: "Mensal",
          priceCents: 12900,
          billingInterval: "monthly",
          active: true,
        })
        .returning({ id: plans.id });
      console.log("Plano 'Mensal' criado para vincular assinaturas.");
      return created!.id;
    });
  }

  let insertedStudents = 0;
  let updatedStudents = 0;
  let createdSubs = 0;
  let createdInvoices = 0;
  let skipped = 0;
  const touched: string[] = [];

  for (const s of list) {
    if (!s.fullName || !s.cpf) {
      skipped += 1;
      continue;
    }

    if (DRY_RUN) {
      continue;
    }

    // upsert do aluno por (tenantId, cpf)
    const studentId = await withBypassRlsTransaction(async (tx) => {
      const [existing] = await tx
        .select({ id: students.id })
        .from(students)
        .where(and(eq(students.tenantId, tenantId), eq(students.cpf, s.cpf)))
        .limit(1);

      if (existing) {
        await tx
          .update(students)
          .set({
            fullName: s.fullName,
            email: s.email,
            whatsapp: s.whatsapp,
            updatedAt: new Date(),
          })
          .where(eq(students.id, existing.id));
        updatedStudents += 1;
        return existing.id;
      }

      const [created] = await tx
        .insert(students)
        .values({
          tenantId,
          fullName: s.fullName,
          cpf: s.cpf,
          email: s.email,
          whatsapp: s.whatsapp,
          status: "inactive",
        })
        .returning({ id: students.id });
      insertedStudents += 1;
      return created!.id;
    });

    if (WITH_BILLING && planId && s.valorCents != null && s.dueAt) {
      const startsAt = s.startsAt ? startOfDay(s.startsAt) : startOfDay(s.dueAt);
      const dueAt = endOfDay(s.dueAt);

      // assinatura ativa (cria uma se não houver)
      const subId = await withBypassRlsTransaction(async (tx) => {
        const [existing] = await tx
          .select({ id: studentSubscriptions.id })
          .from(studentSubscriptions)
          .where(
            and(
              eq(studentSubscriptions.tenantId, tenantId),
              eq(studentSubscriptions.studentId, studentId),
              eq(studentSubscriptions.active, true),
            ),
          )
          .limit(1);
        if (existing) return existing.id;
        const [created] = await tx
          .insert(studentSubscriptions)
          .values({
            tenantId,
            studentId,
            planId,
            startsAt,
            endsAt: null,
            active: true,
          })
          .returning({ id: studentSubscriptions.id });
        createdSubs += 1;
        return created!.id;
      });

      // fatura do período atual (idempotente pela chave import:cpf:dueAt)
      const idempotencyKey = `import:${s.cpf}:${s.dueAt}`;
      await withBypassRlsTransaction(async (tx) => {
        const [existing] = await tx
          .select({ id: invoices.id })
          .from(invoices)
          .where(
            and(
              eq(invoices.tenantId, tenantId),
              eq(invoices.idempotencyKey, idempotencyKey),
            ),
          )
          .limit(1);
        if (existing) return;
        const [inv] = await tx
          .insert(invoices)
          .values({
            tenantId,
            studentId,
            amountCents: s.valorCents!,
            currency: "BRL",
            status: "open",
            dueAt,
            idempotencyKey,
          })
          .returning({ id: invoices.id });
        await tx.insert(invoiceTimelineEvents).values({
          tenantId,
          invoiceId: inv!.id,
          type: "note",
          payload: {
            message: `Importado do sistema anterior (assinatura ${subId}).`,
          },
        });
        createdInvoices += 1;
      });
    }

    touched.push(studentId);
  }

  if (!DRY_RUN) {
    console.log("Recalculando status dos alunos…");
    for (const id of touched) {
      await recalculateStudentStatus(tenantId, id);
    }
  }

  console.log("\n=== Importação concluída ===");
  console.log("Alunos novos:", insertedStudents);
  console.log("Alunos atualizados:", updatedStudents);
  console.log("Assinaturas criadas:", createdSubs);
  console.log("Faturas criadas:", createdInvoices);
  console.log("Ignorados (sem nome/CPF):", skipped);
  if (DRY_RUN) console.log("(DRY-RUN: nenhuma gravação foi feita)");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
