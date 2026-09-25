import { describe, expect, it } from "vitest";
import {
  WORKER_HEARTBEAT_TTL_SEC,
  classifyWorkerHeartbeat,
} from "@/lib/workers/heartbeat";

const ttlMs = WORKER_HEARTBEAT_TTL_SEC * 1000;

describe("heartbeat do worker", () => {
  it("diferencia ativo, ausente e vencido", () => {
    const now = 1_000_000;
    expect(
      classifyWorkerHeartbeat({ beatAt: null, seenAt: null, now, ttlMs }),
    ).toBe("absent");
    expect(
      classifyWorkerHeartbeat({ beatAt: now - 5_000, seenAt: now - 5_000, now, ttlMs }),
    ).toBe("active");
    expect(
      classifyWorkerHeartbeat({ beatAt: null, seenAt: now - 120_000, now, ttlMs }),
    ).toBe("stale");
    expect(
      classifyWorkerHeartbeat({ beatAt: now - ttlMs - 1, seenAt: now - ttlMs - 1, now, ttlMs }),
    ).toBe("stale");
  });
});
