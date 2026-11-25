import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

process.env.OBSERVABILITY_ALERT_WEBHOOK_URL = "https://alerts.example.test/hook";
process.env.CRON_SECRET = "health-test-cron-secret";

describe("health: alerta de worker parado", () => {
  const calls: Array<{ url: string; body: string }> = [];
  const realFetch = globalThis.fetch;

  beforeAll(async () => {
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), body: String(init?.body ?? "") });
      return new Response("ok");
    });
    const { getRedis } = await import("@/lib/redis");
    const { WORKER_HEARTBEAT_KEY } = await import("@/lib/workers/heartbeat");
    await getRedis().del("alert:worker_down", WORKER_HEARTBEAT_KEY);
  });

  afterAll(() => {
    vi.stubGlobal("fetch", realFetch);
  });

  it("avisa uma vez quando o worker está ausente e não repete dentro do intervalo", async () => {
    const { GET } = await import("@/app/api/health/route");
    const first = await GET(new Request("http://test/api/health"));
    const body = (await first.json()) as { worker: string };
    expect(body.worker).not.toBe("active");
    await GET(new Request("http://test/api/health"));
    const alerts = calls.filter((c) => c.url.includes("alerts.example.test"));
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.body).toContain("worker.down");
  });

  it("mensagem de erro do cron só aparece com o segredo", async () => {
    const { recordCronRun } = await import("@/lib/cron/record");
    await recordCronRun({ job: "health-test", ok: false, summary: {}, error: "falha interna xyz" });
    const { GET } = await import("@/app/api/health/route");
    const pub = await (await GET(new Request("http://test/api/health"))).text();
    expect(pub).not.toContain("falha interna xyz");
    const priv = await (
      await GET(
        new Request("http://test/api/health", {
          headers: { authorization: "Bearer health-test-cron-secret" },
        }),
      )
    ).text();
    expect(priv).toContain("falha interna xyz");
  });
});
