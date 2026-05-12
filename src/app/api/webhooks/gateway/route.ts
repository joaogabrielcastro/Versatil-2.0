import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api/json";
import { getEnv } from "@/lib/env";
import { webhookDedupe } from "@/lib/db/schema";
import { withBypassRlsTransaction } from "@/lib/db/with-tenant";
import { getQueue } from "@/lib/queues/bull";
import { webhookJobSchema } from "@/lib/queues/job-payloads";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const expected = getEnv().WEBHOOK_INGEST_SECRET;
  if (!expected) {
    return jsonError(503, "WEBHOOK_INGEST_SECRET não configurado.");
  }
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${expected}`) {
    return jsonError(401, "Não autorizado.");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "JSON inválido.");
  }

  const parsed = webhookJobSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, "Payload inválido.");
  }

  const inserted = await withBypassRlsTransaction(async (tx) => {
    return tx
      .insert(webhookDedupe)
      .values({
        tenantId: parsed.data.tenantId,
        provider: parsed.data.provider,
        eventId: parsed.data.eventId,
      })
      .onConflictDoNothing({
        target: [
          webhookDedupe.tenantId,
          webhookDedupe.provider,
          webhookDedupe.eventId,
        ],
      })
      .returning({ id: webhookDedupe.id });
  });

  if (inserted.length === 0) {
    return NextResponse.json({ ok: true, deduped: true });
  }

  await getQueue("webhooks").add("gateway", parsed.data, {
    removeOnComplete: 100,
    removeOnFail: 50,
  });

  return NextResponse.json({ ok: true, deduped: false });
}
