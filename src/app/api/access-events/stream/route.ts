import { desc } from "drizzle-orm";
import { accessEvents } from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";
import { withTenantTransaction } from "@/lib/db/with-tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session || session.typ !== "tenant" || !session.tid) {
    return new Response("unauthorized", { status: 401 });
  }
  const tenantId = session.tid;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const tick = async () => {
        if (closed) return;
        try {
          const rows = await withTenantTransaction(tenantId, async (tx) => {
            return tx
              .select({
                id: accessEvents.id,
                studentId: accessEvents.studentId,
                allowed: accessEvents.allowed,
                reason: accessEvents.reason,
                createdAt: accessEvents.createdAt,
              })
              .from(accessEvents)
              .orderBy(desc(accessEvents.createdAt))
              .limit(40);
          });
          const payload = JSON.stringify({
            events: rows.map((r) => ({
              ...r,
              createdAt: r.createdAt.toISOString(),
            })),
          });
          controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
        } catch {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ events: [] })}\n\n`),
          );
        }
      };

      await tick();
      const timer = setInterval(() => {
        void tick();
      }, 4000);

      request.signal.addEventListener("abort", () => {
        closed = true;
        clearInterval(timer);
        try {
          controller.close();
        } catch {
          /* ignore */
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
