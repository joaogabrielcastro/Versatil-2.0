import { randomUUID } from "crypto";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { invoices, paymentConflicts, plans, studentSubscriptions, students } from "@/lib/db/schema";
import { withBypassRlsTransaction } from "@/lib/db/with-tenant";
import { cancelSubscription } from "@/lib/services/billing/subscription-actions";
import { createTenantWithAdmin } from "@/lib/services/onboarding/create-tenant";
import { processWebhookJob } from "@/workers/processors/webhook-job";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

async function fixture() {
  const suffix = randomUUID().slice(0, 8);
  const created = await createTenantWithAdmin({
    name: `Race ${suffix}`,
    slug: `race-${suffix}`,
    adminEmail: `race-${suffix}@example.com`,
    adminPassword: "senha-segura-12",
  });
  const tenantId = created.tenant.id;
  const row = await withBypassRlsTransaction(async (tx) => {
    const [plan] = await tx.insert(plans).values({
      tenantId,
      name: "Mensal",
      priceCents: 10000,
      billingInterval: "monthly",
    }).returning();
    const [student] = await tx.insert(students).values({
      tenantId,
      fullName: "Aluno disputa",
      cpf: `r${suffix}`,
    }).returning();
    const [sub] = await tx.insert(studentSubscriptions).values({
      tenantId,
      studentId: student!.id,
      planId: plan!.id,
      priceCents: 10000,
      billingInterval: "monthly",
      startsAt: new Date("2026-01-15T15:00:00.000Z"),
      endsAt: new Date("2026-06-15T15:00:00.000Z"),
      active: true,
    }).returning();
    const [invoice] = await tx.insert(invoices).values({
      tenantId,
      studentId: student!.id,
      amountCents: 10000,
      currency: "BRL",
      status: "open",
      dueAt: new Date("2026-02-15T15:00:00.000Z"),
      externalId: `ch_${suffix}`,
      idempotencyKey: `sub:${sub!.id}:2026-02-15`,
    }).returning();
    return { studentId: student!.id, subscriptionId: sub!.id, invoiceId: invoice!.id, chargeId: `ch_${suffix}` };
  });
  return { tenantId, actor: created.admin.id, ...row };
}

async function holdThen(
  invoiceId: string,
  apply: (sql: postgres.TransactionSql) => Promise<void>,
  other: () => Promise<void>,
) {
  const db = postgres(process.env.DATABASE_URL!, { max: 1 });
  const locked = deferred();
  const release = deferred();
  const holder = db.begin(async (sql) => {
    await sql`select id from invoices where id = ${invoiceId} for update`;
    locked.resolve();
    await release.promise;
    await apply(sql);
  });
  await locked.promise;
  const raced = other();
  await new Promise((r) => setTimeout(r, 300));
  release.resolve();
  await holder;
  await raced;
  await db.end();
}

describe("webhook e cancelamento em conexões separadas", () => {
  it("pagamento confirmado primeiro impede a anulação", async () => {
    const fx = await fixture();
    await holdThen(
      fx.invoiceId,
      async (sql) => {
        await sql`update invoices set status = 'paid', paid_at = now(), gateway_charge_status = 'succeeded' where id = ${fx.invoiceId}`;
      },
      () =>
        cancelSubscription({
          tenantId: fx.tenantId,
          studentId: fx.studentId,
          subscriptionId: fx.subscriptionId,
          actorUserId: fx.actor,
          reason: "concorrente",
          now: new Date("2026-01-20T15:00:00.000Z"),
        }).then((result) => {
          expect(result.ok).toBe(true);
        }),
    );
    const [row] = await withBypassRlsTransaction(async (tx) => {
      return tx.select({ status: invoices.status }).from(invoices).where(eq(invoices.id, fx.invoiceId));
    });
    expect(row?.status).toBe("paid");
  });

  it("anulação primeiro grava conflito deduplicado e não reativa", async () => {
    const fx = await fixture();
    await holdThen(
      fx.invoiceId,
      async (sql) => {
        await sql`update invoices set status = 'void' where id = ${fx.invoiceId}`;
      },
      () =>
        processWebhookJob({
          tenantId: fx.tenantId,
          provider: "stone",
          eventId: `evt_${fx.chargeId}`,
          type: "invoice.paid",
          invoiceId: fx.invoiceId,
          chargeId: fx.chargeId,
          amountCents: 10000,
          currency: "BRL",
        }),
    );
    await processWebhookJob({
      tenantId: fx.tenantId,
      provider: "stone",
      eventId: `evt_${fx.chargeId}_2`,
      type: "invoice.paid",
      invoiceId: fx.invoiceId,
      chargeId: fx.chargeId,
      amountCents: 10000,
      currency: "BRL",
    });
    const [invoice] = await withBypassRlsTransaction(async (tx) => {
      return tx.select({ status: invoices.status }).from(invoices).where(eq(invoices.id, fx.invoiceId));
    });
    const conflicts = await withBypassRlsTransaction(async (tx) => {
      return tx
        .select({
          chargeId: paymentConflicts.chargeId,
          amountCents: paymentConflicts.amountCents,
          reason: paymentConflicts.reason,
        })
        .from(paymentConflicts)
        .where(eq(paymentConflicts.invoiceId, fx.invoiceId));
    });
    expect(invoice?.status).toBe("void");
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.chargeId).toBe(fx.chargeId);
    expect(conflicts[0]?.amountCents).toBe(10000);
    expect(conflicts[0]?.reason).toMatch(/anulada/);
  });
});
