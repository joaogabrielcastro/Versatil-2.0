import { and, eq } from "drizzle-orm";
import Stripe from "stripe";
import { NextResponse } from "next/server";
import { z } from "zod";
import { logAudit } from "@/lib/audit/log";
import { jsonError } from "@/lib/api/json";
import { getSession } from "@/lib/auth/session";
import { invoices } from "@/lib/db/schema";
import { withTenantTransaction } from "@/lib/db/with-tenant";
import { resolveStripeSecretKey } from "@/lib/billing/stripe-resolve";
import { getEnv } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  invoiceId: z.string().uuid(),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session || session.typ !== "tenant" || !session.tid) {
    return jsonError(401, "Não autenticado.");
  }
  const tenantId = session.tid;

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return jsonError(400, "Payload inválido.");
  }

  const secret = await resolveStripeSecretKey(tenantId);
  if (!secret) {
    return jsonError(
      503,
      "Stripe não configurado (STRIPE_SECRET_KEY ou credenciais do tenant).",
    );
  }

  const inv = await withTenantTransaction(tenantId, async (tx) => {
    const [row] = await tx
      .select()
      .from(invoices)
      .where(
        and(eq(invoices.id, body.invoiceId), eq(invoices.tenantId, tenantId)),
      )
      .limit(1);
    return row ?? null;
  });

  if (!inv) {
    return jsonError(404, "Fatura não encontrada.");
  }
  if (inv.status !== "open") {
    return jsonError(400, "Fatura não está em aberto.");
  }

  const env = getEnv();
  const appUrl = env.APP_URL ?? "http://localhost:3000";
  const stripe = new Stripe(secret);

  const sessionStripe = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: inv.currency.toLowerCase(),
          unit_amount: inv.amountCents,
          product_data: {
            name: `Pagamento fatura`,
          },
        },
        quantity: 1,
      },
    ],
    success_url: `${appUrl}/balcao/alunos/${inv.studentId}?paid=1`,
    cancel_url: `${appUrl}/balcao/alunos/${inv.studentId}?canceled=1`,
    metadata: {
      tenantId,
      invoiceId: inv.id,
      studentId: inv.studentId,
    },
  });

  await logAudit({
    tenantId,
    actorUserId: session.sub,
    action: "billing.stripe_checkout_created",
    entity: "invoice",
    entityId: inv.id,
    payload: { checkoutSessionId: sessionStripe.id },
  });

  return NextResponse.json({ url: sessionStripe.url });
}
