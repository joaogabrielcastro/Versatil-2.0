import { UnrecoverableError } from "bullmq";
import { eq } from "drizzle-orm";
import { log } from "@/lib/observability/logger";
import { importJobs, students } from "@/lib/db/schema";
import { parseCpfInput } from "@/lib/cpf";
import { importJobFinalStatus } from "@/lib/import/job-status";
import type { ImportJobPayload } from "@/lib/queues/job-payloads";
import { withTenantTransaction } from "@/lib/db/with-tenant";
import { recalculateStudentStatus } from "@/lib/services/student-status";

function pick(
  row: Record<string, string>,
  mapping: Record<string, string>,
  field: string,
): string | null {
  const col = mapping[field];
  if (!col) return null;
  const v = row[col];
  return v === undefined || v === null ? null : String(v).trim();
}

async function markImportFailed(
  tenantId: string,
  importJobId: string,
  errorMessage: string,
): Promise<void> {
  await withTenantTransaction(tenantId, async (tx) => {
    await tx
      .update(importJobs)
      .set({
        status: "failed",
        finishedAt: new Date(),
        errorMessage,
      })
      .where(eq(importJobs.id, importJobId));
  });
}

export async function processImportJob(data: ImportJobPayload): Promise<void> {
  const { importJobId, tenantId, mapping, rows } = data;
  const touched = new Set<string>();
  let inserted = 0;
  let failed = 0;

  log.info("import.job_start", {
    importJobId,
    tenantId,
    rowCount: rows.length,
  });

  try {
    await withTenantTransaction(tenantId, async (tx) => {
      await tx
        .update(importJobs)
        .set({ status: "processing" })
        .where(eq(importJobs.id, importJobId));

      for (const row of rows) {
        const fullName = pick(row, mapping, "fullName");
        const cpf = parseCpfInput(pick(row, mapping, "cpf"));
        if (!fullName || !cpf) {
          failed += 1;
          continue;
        }
        const emailRaw = pick(row, mapping, "email");
        const whatsapp = pick(row, mapping, "whatsapp");
        const birthRaw = pick(row, mapping, "birthDate");
        let birthDate: Date | null = null;
        if (birthRaw) {
          const d = new Date(birthRaw);
          birthDate = Number.isNaN(d.getTime()) ? null : d;
        }

        try {
          const [created] = await tx
            .insert(students)
            .values({
              tenantId,
              fullName,
              cpf,
              email: emailRaw && emailRaw.length > 0 ? emailRaw : null,
              whatsapp: whatsapp && whatsapp.length > 0 ? whatsapp : null,
              birthDate,
            })
            .returning({ id: students.id });
          if (created) {
            touched.add(created.id);
            inserted += 1;
          }
        } catch {
          failed += 1;
        }
      }

      const status = importJobFinalStatus(inserted, failed);
      await tx
        .update(importJobs)
        .set({
          status,
          finishedAt: new Date(),
          errorMessage:
            failed > 0
              ? `${inserted} inseridos, ${failed} linhas ignoradas (duplicidade ou dados inválidos).`
              : null,
        })
        .where(eq(importJobs.id, importJobId));
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await markImportFailed(tenantId, importJobId, message.slice(0, 500));
    throw new UnrecoverableError(message);
  }

  if (importJobFinalStatus(inserted, failed) === "failed") {
    log.error("import.job_failed", {
      importJobId,
      tenantId,
      inserted,
      failed,
    });
    return;
  }

  for (const id of touched) {
    await recalculateStudentStatus(tenantId, id);
  }

  log.info("import.job_done", {
    importJobId,
    tenantId,
    inserted,
    failed,
    recalculatedStudents: touched.size,
  });
}
