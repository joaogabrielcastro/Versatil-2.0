import { randomUUID } from "crypto";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { invoiceTimelineEvents, invoices, students } from "@/lib/db/schema";
import { withBypassRlsTransaction, withTenantTransaction } from "@/lib/db/with-tenant";
import { manualProvider } from "@/lib/payments/providers/manual";
import { createTenantWithAdmin } from "@/lib/services/onboarding/create-tenant";
import { processWebhookJob } from "@/workers/processors/webhook-job";

async function seedInvoice(input: {
  suffix: string;
  externalId: string | null;
  gatewayChargeStatus?: string;
}) {
  const created = await createTenantWithAdmin({
    name: `Academia ${input.suffix}`,
    slug: `pay-${input.suffix}`,
    adminEmail: `admin-${input.suffix}@example.com`,
    adminPassword: "senha-segura-12",
  });
  const tenantId = created.tenant.id;
  const due = new Date("2026-10-01T00:00:00.000Z");
  const invoiceId = await withBypassRlsTransaction(async (tx) => {
    const [student] = await tx
      .insert(students)
      .values({
        tenantId,
        fullName: "Aluno pagamento",
        cpf: "11144477735",
      })
      .returning({ id: students.id });
    const [inv] = await tx
      .insert(invoices)
      .values({
        tenantId,
        studentId: student!.id,
        amountCents: 9900,
        currency: "BRL",
        status: "open",
        dueAt: due,
        externalId: input.externalId,
        gatewayChargeStatus: input.gatewayChargeStatus ?? "pending",
      })
      .returning({ id: invoices.id });
    return inv!.id;
  });
  return { tenantId, invoiceId };
}

function paidJob(input: {
  tenantId: string;
  invoiceId: string;
  eventId: string;
  chargeId?: string;
  amountCents?: number;
  currency?: string;
}) {
  return {
    tenantId: input.tenantId,
    provider: "stone" as const,
    eventId: input.eventId,
    type: "invoice.paid",
    invoiceId: input.invoiceId,
    chargeId: input.chargeId,
    amountCents: input.amountCents,
    currency: input.currency,
  };
}

async function invoiceStatus(tenantId: string, invoiceId: string) {
  return withTenantTransaction(tenantId, async (tx) => {
    const [row] = await tx
      .select({
        status: invoices.status,
        settlementSource: invoices.settlementSource,
        gatewayChargeStatus: invoices.gatewayChargeStatus,
      })
      .from(invoices)
      .where(and(eq(invoices.id, invoiceId), eq(invoices.tenantId, tenantId)))
      .limit(1);
    const timeline = await tx
      .select({ type: invoiceTimelineEvents.type })
      .from(invoiceTimelineEvents)
      .where(eq(invoiceTimelineEvents.invoiceId, invoiceId));
    return { row, timeline };
  });
}

describe("liquidação Stone no banco", () => {
  it("não quita sem valor, com valor divergente, cobrança alheia ou outro tenant", async () => {
    const suffix = randomUUID().slice(0, 8);
    const owner = await seedInvoice({
      suffix: `a-${suffix}`,
      externalId: "ch_owner",
    });
    const other = await seedInvoice({
      suffix: `b-${suffix}`,
      externalId: "ch_other",
    });

    await processWebhookJob(
      paidJob({
        tenantId: owner.tenantId,
        invoiceId: owner.invoiceId,
        eventId: `no-amount-${suffix}`,
        chargeId: "ch_owner",
        currency: "BRL",
      }),
    );
    await processWebhookJob(
      paidJob({
        tenantId: owner.tenantId,
        invoiceId: owner.invoiceId,
        eventId: `bad-amount-${suffix}`,
        chargeId: "ch_owner",
        amountCents: 100,
        currency: "BRL",
      }),
    );
    await processWebhookJob(
      paidJob({
        tenantId: owner.tenantId,
        invoiceId: owner.invoiceId,
        eventId: `other-charge-${suffix}`,
        chargeId: "ch_other",
        amountCents: 9900,
        currency: "BRL",
      }),
    );
    await processWebhookJob(
      paidJob({
        tenantId: other.tenantId,
        invoiceId: owner.invoiceId,
        eventId: `cross-tenant-${suffix}`,
        chargeId: "ch_owner",
        amountCents: 9900,
        currency: "BRL",
      }),
    );

    const after = await invoiceStatus(owner.tenantId, owner.invoiceId);
    expect(after.row?.status).toBe("open");
    expect(after.timeline).toEqual([]);
  });

  it("quita uma vez e ignora repetição concorrente", async () => {
    const suffix = randomUUID().slice(0, 8);
    const owner = await seedInvoice({
      suffix: `c-${suffix}`,
      externalId: "ch_once",
    });
    const claim = {
      tenantId: owner.tenantId,
      invoiceId: owner.invoiceId,
      chargeId: "ch_once",
      amountCents: 9900,
      currency: "BRL",
    };
    await Promise.all([
      processWebhookJob(paidJob({ ...claim, eventId: `a-${suffix}` })),
      processWebhookJob(paidJob({ ...claim, eventId: `b-${suffix}` })),
    ]);
    await processWebhookJob(paidJob({ ...claim, eventId: `a-${suffix}` }));

    const after = await invoiceStatus(owner.tenantId, owner.invoiceId);
    expect(after.row?.status).toBe("paid");
    expect(after.row?.settlementSource).toBe("automatic_gateway");
    expect(after.timeline.filter((e) => e.type === "webhook_received")).toHaveLength(
      1,
    );
  });

  it("bloqueia baixa manual com POS pendente e não mistura com o webhook", async () => {
    const suffix = randomUUID().slice(0, 8);
    const owner = await seedInvoice({
      suffix: `d-${suffix}`,
      externalId: "ch_pos",
      gatewayChargeStatus: "pending",
    });

    const manualWhilePending = await withTenantTransaction(
      owner.tenantId,
      async (tx) =>
        manualProvider.settleManual!({
          tx,
          tenantId: owner.tenantId,
          invoiceId: owner.invoiceId,
          paymentMethod: "cash",
          note: null,
          actorUserId: null,
        }),
    );
    expect(manualWhilePending.status).toBe("blocked_pending_pos");

    await Promise.all([
      processWebhookJob(
        paidJob({
          tenantId: owner.tenantId,
          invoiceId: owner.invoiceId,
          eventId: `pos-${suffix}`,
          chargeId: "ch_pos",
          amountCents: 9900,
          currency: "BRL",
        }),
      ),
      withTenantTransaction(owner.tenantId, async (tx) =>
        manualProvider.settleManual!({
          tx,
          tenantId: owner.tenantId,
          invoiceId: owner.invoiceId,
          paymentMethod: "cash",
          note: null,
          actorUserId: null,
        }),
      ),
    ]);

    const after = await invoiceStatus(owner.tenantId, owner.invoiceId);
    expect(after.row?.status).toBe("paid");
    expect(after.row?.settlementSource).toBe("automatic_gateway");
    expect(after.timeline.some((e) => e.type === "manual_payment")).toBe(false);
  });
});
