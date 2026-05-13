import { getEnv } from "@/lib/env";
import { log } from "@/lib/observability/logger";

export type AlertPayload = {
  type: string;
  severity: "warning" | "critical";
  summary: string;
  detail?: Record<string, unknown>;
};

export async function sendObservabilityAlert(payload: AlertPayload): Promise<void> {
  let url: string | undefined;
  try {
    const env = getEnv();
    url = env.OBSERVABILITY_ALERT_WEBHOOK_URL;
    if (!url) return;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": "versatil-observability/1",
    };
    if (env.OBSERVABILITY_ALERT_WEBHOOK_TOKEN) {
      headers.Authorization = `Bearer ${env.OBSERVABILITY_ALERT_WEBHOOK_TOKEN}`;
    }

    const body = JSON.stringify({
      ...payload,
      ts: new Date().toISOString(),
    });

    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 12_000);
    const res = await fetch(url, {
      method: "POST",
      headers,
      body,
      signal: ctrl.signal,
    });
    clearTimeout(t);

    if (!res.ok) {
      log.warn("observability.alert_webhook_http_error", {
        status: res.status,
        type: payload.type,
      });
    }
  } catch (e) {
    log.warn("observability.alert_webhook_failed", {
      type: payload.type,
      errMessage: e instanceof Error ? e.message : String(e),
      hadUrl: Boolean(url),
    });
  }
}
