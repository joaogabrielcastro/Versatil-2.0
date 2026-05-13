import Stripe from "stripe";
import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api/json";
import { getEnv } from "@/lib/env";
import { processWebhookJob } from "@/workers/processors/webhook-job";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const env = getEnv();
  if (!env.STRIPE_WEBHOOK_SECRET) {
    return jsonError(503, "STRIPE_WEBHOOK_SECRET não configurado.");
  }

  const raw = await request.text();
  const sig = request.headers.get("stripe-signature");
  if (!sig) {
    return jsonError(400, "Cabeçalho stripe-signature ausente.");
  }

  let event: Stripe.Event;
  try {
    event = Stripe.webhooks.constructEvent(raw, sig, env.STRIPE_WEBHOOK_SECRET);
  } catch {
    return jsonError(400, "Payload ou assinatura Stripe inválidos.");
  }

  if (event.type === "checkout.session.completed") {
    const s = event.data.object as Stripe.Checkout.Session;
    const tenantId = s.metadata?.tenantId;
    const invoiceId = s.metadata?.invoiceId;
    if (tenantId && invoiceId) {
      await processWebhookJob({
        tenantId,
        provider: "stripe",
        eventId: event.id,
        type: "invoice.paid",
        invoiceId,
        raw: s,
      });
    }
  }

  return NextResponse.json({ received: true });
}
