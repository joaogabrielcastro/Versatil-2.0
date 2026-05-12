import Papa from "papaparse";
import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError } from "@/lib/api/json";
import { getSession } from "@/lib/auth/session";
import { importJobs } from "@/lib/db/schema";
import { getQueue } from "@/lib/queues/bull";
import { withTenantTransaction } from "@/lib/db/with-tenant";

export const dynamic = "force-dynamic";

const mappingSchema = z.object({
  fullName: z.string().min(1),
  cpf: z.string().min(1),
  email: z.string().optional(),
  whatsapp: z.string().optional(),
  birthDate: z.string().optional(),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session || session.typ !== "tenant" || !session.tid) {
    return jsonError(401, "Não autenticado como equipe da academia.");
  }
  const tenantId = session.tid;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonError(400, "Use multipart/form-data.");
  }

  const file = form.get("file");
  const mappingRaw = form.get("mapping");
  if (!(file instanceof File)) {
    return jsonError(400, "Campo file (CSV) é obrigatório.");
  }
  if (typeof mappingRaw !== "string") {
    return jsonError(
      400,
      'Campo mapping (JSON) é obrigatório — ex.: {"fullName":"Nome","cpf":"CPF"}.',
    );
  }

  let mapping: z.infer<typeof mappingSchema>;
  try {
    mapping = mappingSchema.parse(JSON.parse(mappingRaw));
  } catch {
    return jsonError(
      400,
      "mapping inválido. Obrigatório: fullName e cpf (nomes das colunas no CSV).",
    );
  }

  const text = await file.text();
  if (text.length > 2_000_000) {
    return jsonError(400, "Arquivo grande demais (máx. ~2MB).");
  }

  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: "greedy",
  });

  if (parsed.errors.length > 0) {
    return jsonError(400, "Falha ao ler CSV.");
  }

  const rows = (parsed.data ?? [])
    .map((row) =>
      Object.fromEntries(
        Object.entries(row).map(([k, v]) => [
          String(k),
          v === null || v === undefined ? "" : String(v),
        ]),
      ),
    )
    .filter((r) => Object.keys(r).length > 0)
    .slice(0, 2000);

  const [first] = rows;
  if (!first) {
    return jsonError(400, "CSV sem linhas de dados.");
  }

  for (const key of Object.values(mapping)) {
    if (!(key in first)) {
      return jsonError(
        400,
        `Coluna "${key}" não encontrada no cabeçalho do CSV.`,
      );
    }
  }

  const job = await withTenantTransaction(tenantId, async (tx) => {
    const [row] = await tx
      .insert(importJobs)
      .values({
        tenantId,
        createdByUserId: session.sub,
        status: "queued",
        fileKey: file.name || "import.csv",
        columnMapping: mapping,
      })
      .returning({ id: importJobs.id });
    return row!;
  });

  await getQueue("imports").add(
    "run",
    {
      importJobId: job.id,
      tenantId,
      mapping,
      rows,
    },
    { removeOnComplete: 100, removeOnFail: 50 },
  );

  return NextResponse.json(
    { importJobId: job.id, queuedRows: rows.length },
    { status: 202 },
  );
}
