import { eq } from "drizzle-orm";
import { log } from "@/lib/observability/logger";
import { importJobs, students } from "@/lib/db/schema";
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

  await withTenantTransaction(tenantId, async (tx) => {
    await tx
      .update(importJobs)
      .set({ status: "processing" })
      .where(eq(importJobs.id, importJobId));

    for (const row of rows) {
      const fullName = pick(row, mapping, "fullName");
      const cpf = pick(row, mapping, "cpf");
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

    await tx
      .update(importJobs)
      .set({
        status: "completed",
        finishedAt: new Date(),
        errorMessage:
          failed > 0
            ? `${inserted} inseridos, ${failed} linhas ignoradas (duplicidade ou dados inválidos).`
            : null,
      })
      .where(eq(importJobs.id, importJobId));
  });

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
