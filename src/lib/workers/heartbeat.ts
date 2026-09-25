import type Redis from "ioredis";

export const WORKER_HEARTBEAT_KEY = "versatil:worker:heartbeat";
export const WORKER_SEEN_KEY = "versatil:worker:seen";
export const WORKER_HEARTBEAT_TTL_SEC = 30;

export type WorkerLiveness = "active" | "absent" | "stale";

export async function writeWorkerHeartbeat(redis: Redis): Promise<void> {
  const now = String(Date.now());
  await redis.set(WORKER_HEARTBEAT_KEY, now, "EX", WORKER_HEARTBEAT_TTL_SEC);
  await redis.set(WORKER_SEEN_KEY, now);
}

export async function clearWorkerHeartbeat(redis: Redis): Promise<void> {
  await redis.del(WORKER_HEARTBEAT_KEY);
}

export async function readWorkerLiveness(redis: Redis): Promise<WorkerLiveness> {
  const [beat, seen] = await Promise.all([
    redis.get(WORKER_HEARTBEAT_KEY),
    redis.get(WORKER_SEEN_KEY),
  ]);
  const asTime = (value: string | null) => {
    if (!value) return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  };
  return classifyWorkerHeartbeat({
    beatAt: asTime(beat),
    seenAt: asTime(seen),
    now: Date.now(),
    ttlMs: WORKER_HEARTBEAT_TTL_SEC * 1000,
  });
}

export function classifyWorkerHeartbeat(input: {
  beatAt: number | null;
  seenAt: number | null;
  now: number;
  ttlMs: number;
}): WorkerLiveness {
  const beatFresh =
    input.beatAt != null && input.now - input.beatAt <= input.ttlMs;
  if (beatFresh) return "active";
  if (input.seenAt != null || input.beatAt != null) return "stale";
  return "absent";
}
