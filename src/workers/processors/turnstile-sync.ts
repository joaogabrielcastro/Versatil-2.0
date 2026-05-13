import { getEnv } from "@/lib/env";
import type { TurnstileSyncJobPayload } from "@/lib/queues/job-payloads";

export async function processTurnstileSync(
  data: TurnstileSyncJobPayload,
): Promise<void> {
  const url = getEnv().TURNSTILE_PUSH_URL;
  if (!url) {
    return;
  }
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    throw new Error(`turnstile_push_failed:${res.status}`);
  }
}
