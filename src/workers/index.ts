import "dotenv/config";
import { Worker } from "bullmq";
import Redis from "ioredis";
import { getEnv } from "@/lib/env";
import { QUEUE_NAMES } from "@/lib/queues/names";
import { importJobPayloadSchema, webhookJobSchema } from "@/lib/queues/job-payloads";
import { processImportJob } from "@/workers/processors/import-job";
import { processWebhookJob } from "@/workers/processors/webhook-job";

function createConnection() {
  return new Redis(getEnv().REDIS_URL, { maxRetriesPerRequest: null });
}

new Worker(
  QUEUE_NAMES.imports,
  async (job) => {
    const parsed = importJobPayloadSchema.safeParse(job.data);
    if (!parsed.success) {
      console.error("[worker:imports] payload inválido", parsed.error.flatten());
      throw new Error("invalid_import_payload");
    }
    await processImportJob(parsed.data);
  },
  { connection: createConnection() },
);

new Worker(
  QUEUE_NAMES.turnstileSync,
  async (job) => {
    console.log("[worker:turnstile-sync] (stub) enviar ao hardware", job.id, job.data);
  },
  { connection: createConnection() },
);

new Worker(
  QUEUE_NAMES.webhooks,
  async (job) => {
    const parsed = webhookJobSchema.safeParse(job.data);
    if (!parsed.success) {
      console.error("[worker:webhooks] payload inválido", parsed.error.flatten());
      throw new Error("invalid_webhook_payload");
    }
    await processWebhookJob(parsed.data);
  },
  { connection: createConnection() },
);

console.log("Workers BullMQ ativos (imports, turnstile-sync stub, webhooks).");
