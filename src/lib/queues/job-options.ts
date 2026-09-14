export const WEBHOOK_JOB_OPTS = {
  attempts: 8,
  backoff: { type: "exponential" as const, delay: 2_000 },
  removeOnComplete: 200,
  removeOnFail: 200,
};

export const DEFAULT_JOB_OPTS = {
  attempts: 5,
  backoff: { type: "exponential" as const, delay: 3_000 },
  removeOnComplete: 100,
  removeOnFail: 100,
};
