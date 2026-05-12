import "server-only";
import { Queue } from "bullmq";
import Redis from "ioredis";
import { getEnv } from "@/lib/env";
import { QUEUE_NAMES } from "./names";

const queues = new Map<string, Queue>();

export function getQueue(name: keyof typeof QUEUE_NAMES): Queue {
  const qn = QUEUE_NAMES[name];
  let q = queues.get(qn);
  if (!q) {
    const connection = new Redis(getEnv().REDIS_URL, {
      maxRetriesPerRequest: null,
    });
    q = new Queue(qn, { connection });
    queues.set(qn, q);
  }
  return q;
}
