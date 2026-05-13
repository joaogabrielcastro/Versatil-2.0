import type { Job } from "bullmq";
import { Queue, QueueEvents, Worker } from "bullmq";
import type Redis from "ioredis";
import { sendObservabilityAlert } from "@/lib/observability/alert";
import { getEnv } from "@/lib/env";
import { log } from "@/lib/observability/logger";

type Closable = { close: () => Promise<void> };

const closables: Closable[] = [];

export async function shutdownBullTelemetry(): Promise<void> {
  for (const c of closables) {
    await c.close().catch(() => {});
  }
  closables.length = 0;
}

export function registerInstrumentedWorker(
  queueName: string,
  processor: (job: Job) => Promise<void>,
  redis: Redis,
): Worker {
  const worker = new Worker(queueName, processor, {
    connection: redis.duplicate(),
  });
  closables.push(worker);

  worker.on("completed", (job: Job) => {
    const durationMs =
      job.finishedOn != null && job.processedOn != null
        ? job.finishedOn - job.processedOn
        : undefined;
    log.info("bull.job_completed", {
      queue: queueName,
      jobId: String(job.id),
      name: job.name ?? null,
      durationMs,
    });
  });

  worker.on("failed", (job: Job | undefined, err: Error | string) => {
    const errMessage = err instanceof Error ? err.message : String(err);
    log.error("bull.job_failed", {
      queue: queueName,
      jobId: job?.id != null ? String(job.id) : null,
      name: job?.name ?? null,
      attemptsMade: job?.attemptsMade,
      errMessage,
    });
    void sendObservabilityAlert({
      type: "bull.job_failed",
      severity: "critical",
      summary: `Job falhou: ${queueName}`,
      detail: {
        jobId: job?.id != null ? String(job.id) : null,
        error: errMessage,
      },
    });
  });

  worker.on("error", (err: Error) => {
    log.error("bull.worker_error", {
      queue: queueName,
      errMessage: err?.message,
    });
    void sendObservabilityAlert({
      type: "bull.worker_connection_error",
      severity: "critical",
      summary: `Erro no worker ${queueName}`,
      detail: { error: err?.message },
    });
  });

  return worker;
}

export function registerQueueEventsTelemetry(queueName: string, redis: Redis): void {
  const qe = new QueueEvents(queueName, { connection: redis.duplicate() });
  closables.push(qe);

  qe.on("stalled", ({ jobId }) => {
    log.warn("bull.job_stalled", { queue: queueName, jobId: String(jobId) });
    void sendObservabilityAlert({
      type: "bull.job_stalled",
      severity: "warning",
      summary: `Job stalled: ${queueName}`,
      detail: { jobId: String(jobId) },
    });
  });
}

export function startQueueMetricsReporter(
  queueNames: readonly string[],
  redis: Redis,
): void {
  const env = getEnv();
  const intervalMs = env.OBSERVABILITY_METRICS_INTERVAL_MS ?? 60_000;
  const threshold = env.OBSERVABILITY_ALERT_QUEUE_WAITING_THRESHOLD ?? 0;

  const queues = queueNames.map(
    (name) => new Queue(name, { connection: redis.duplicate() }),
  );
  for (const q of queues) {
    closables.push(q);
  }

  const tick = async () => {
    for (const q of queues) {
      try {
        const c = await q.getJobCounts();
        log.info("bull.queue_snapshot", { queue: q.name, counts: c });
        if (threshold > 0 && (c.waiting ?? 0) > threshold) {
          void sendObservabilityAlert({
            type: "bull.queue_backlog",
            severity: "warning",
            summary: `Fila ${q.name}: waiting=${c.waiting} (limite ${threshold})`,
            detail: {
              queue: q.name,
              waiting: c.waiting,
              active: c.active,
              delayed: c.delayed,
              failed: c.failed,
            },
          });
        }
      } catch (e) {
        log.error("bull.queue_metrics_error", {
          queue: q.name,
          errMessage: e instanceof Error ? e.message : String(e),
        });
      }
    }
  };

  void tick();
  setInterval(() => {
    void tick();
  }, intervalMs);
}
