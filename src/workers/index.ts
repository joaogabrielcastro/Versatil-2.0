import "server-only";
import { Worker } from "bullmq";
import Redis from "ioredis";
import { getEnv } from "@/lib/env";
import { QUEUE_NAMES } from "@/lib/queues/names";

function createConnection() {
  return new Redis(getEnv().REDIS_URL, { maxRetriesPerRequest: null });
}

new Worker(QUEUE_NAMES.imports, async (job) => {
  console.log("[worker:imports] job recebido", job.id, job.data);
}, { connection: createConnection() });

new Worker(
  QUEUE_NAMES.turnstileSync,
  async (job) => {
    console.log("[worker:turnstile-sync] job recebido", job.id, job.data);
  },
  { connection: createConnection() },
);

new Worker(
  QUEUE_NAMES.webhooks,
  async (job) => {
    console.log("[worker:webhooks] job recebido", job.id, job.data);
  },
  { connection: createConnection() },
);

console.log("Workers BullMQ iniciados (imports, turnstile-sync, webhooks).");
