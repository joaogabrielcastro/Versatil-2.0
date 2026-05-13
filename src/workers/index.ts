import "dotenv/config";
import type { Job } from "bullmq";
import Redis from "ioredis";
import { getEnv } from "@/lib/env";
import { log } from "@/lib/observability/logger";
import { QUEUE_NAMES } from "@/lib/queues/names";
import {
  importJobPayloadSchema,
  turnstileSyncJobSchema,
  webhookJobSchema,
} from "@/lib/queues/job-payloads";
import {
  registerInstrumentedWorker,
  registerQueueEventsTelemetry,
  shutdownBullTelemetry,
  startQueueMetricsReporter,
} from "@/workers/bull-telemetry";
import { processImportJob } from "@/workers/processors/import-job";
import { processTurnstileSync } from "@/workers/processors/turnstile-sync";
import { processWebhookJob } from "@/workers/processors/webhook-job";

const env = getEnv();
const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });

registerInstrumentedWorker(
  QUEUE_NAMES.imports,
  async (job: Job) => {
    const parsed = importJobPayloadSchema.safeParse(job.data);
    if (!parsed.success) {
      log.error("bull.payload_invalid", {
        queue: QUEUE_NAMES.imports,
        jobId: String(job.id),
        issues: parsed.error.flatten(),
      });
      throw new Error("invalid_import_payload");
    }
    await processImportJob(parsed.data);
  },
  redis,
);

registerInstrumentedWorker(
  QUEUE_NAMES.turnstileSync,
  async (job: Job) => {
    const parsed = turnstileSyncJobSchema.safeParse(job.data);
    if (!parsed.success) {
      log.error("bull.payload_invalid", {
        queue: QUEUE_NAMES.turnstileSync,
        jobId: String(job.id),
        issues: parsed.error.flatten(),
      });
      throw new Error("invalid_turnstile_payload");
    }
    await processTurnstileSync(parsed.data);
  },
  redis,
);

registerInstrumentedWorker(
  QUEUE_NAMES.webhooks,
  async (job: Job) => {
    const parsed = webhookJobSchema.safeParse(job.data);
    if (!parsed.success) {
      log.error("bull.payload_invalid", {
        queue: QUEUE_NAMES.webhooks,
        jobId: String(job.id),
        issues: parsed.error.flatten(),
      });
      throw new Error("invalid_webhook_payload");
    }
    await processWebhookJob(parsed.data);
  },
  redis,
);

for (const name of Object.values(QUEUE_NAMES)) {
  registerQueueEventsTelemetry(name, redis);
}

startQueueMetricsReporter(Object.values(QUEUE_NAMES), redis);

log.info("worker.boot_complete", {
  queues: Object.values(QUEUE_NAMES),
  metricsIntervalMs: env.OBSERVABILITY_METRICS_INTERVAL_MS ?? 60_000,
  alertsEnabled: Boolean(env.OBSERVABILITY_ALERT_WEBHOOK_URL),
});

async function shutdown(signal: string) {
  log.info("worker.shutdown_signal", { signal });
  await shutdownBullTelemetry();
  try {
    await redis.quit();
  } catch {
    redis.disconnect();
  }
  process.exit(0);
}

process.once("SIGTERM", () => {
  void shutdown("SIGTERM");
});
process.once("SIGINT", () => {
  void shutdown("SIGINT");
});
