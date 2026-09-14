import { and, desc, eq, lte, or, isNull } from "drizzle-orm";
import {
  invoices,
  studentSubscriptions,
} from "@/lib/db/schema";
import {
  withBypassRlsTransaction,
  withTenantTransaction,
} from "@/lib/db/with-tenant";
import { MAX_CHARGE_ATTEMPTS, isChargeableNow } from "@/lib/payments/recurring";
import { chargeInvoiceOnStone } from "@/lib/services/billing/stone-charge";

async function activeSubscription(tenantId: string, studentId: string) {
  return withTenantTransaction(tenantId, async (tx) => {
    const [row] = await tx
      .select()
      .from(studentSubscriptions)
      .where(
        and(
          eq(studentSubscriptions.tenantId, tenantId),
          eq(studentSubscriptions.studentId, studentId),
          eq(studentSubscriptions.active, true),
        ),
      )
      .orderBy(desc(studentSubscriptions.createdAt))
      .limit(1);
    return row ?? null;
  });
}

export interface AutoRenewStatus {
  autoRenew: boolean;
  hasCard: boolean;
  provider: string | null;
  hasSubscription: boolean;
}

export async function getAutoRenewStatus(
  tenantId: string,
  studentId: string,
): Promise<AutoRenewStatus> {
  const sub = await activeSubscription(tenantId, studentId);
  return {
    autoRenew: sub?.autoRenew ?? false,
    hasCard: false,
    provider: sub?.provider ?? "stone_connect",
    hasSubscription: Boolean(sub),
  };
}

export async function setAutoRenew(
  tenantId: string,
  studentId: string,
  autoRenew: boolean,
): Promise<{ ok: boolean; reason?: string }> {
  const sub = await activeSubscription(tenantId, studentId);
  if (!sub) return { ok: false, reason: "Aluno sem assinatura ativa." };
  await withTenantTransaction(tenantId, async (tx) => {
    await tx
      .update(studentSubscriptions)
      .set({ autoRenew, provider: autoRenew ? "stone_connect" : sub.provider })
      .where(
        and(
          eq(studentSubscriptions.id, sub.id),
          eq(studentSubscriptions.tenantId, tenantId),
        ),
      );
  });
  return { ok: true };
}

export interface ChargeRunResult {
  attempted: number;
  charged: number;
  failed: number;
}

/**
 * Envia faturas em aberto (assinatura auto-renew) à maquininha Stone.
 * Idempotência e tentativas ficam em `chargeInvoiceOnStone`.
 */
export async function chargeDueInvoicesForTenant(
  tenantId: string,
  now: Date = new Date(),
): Promise<ChargeRunResult> {
  const rows = await withTenantTransaction(tenantId, async (tx) => {
    return tx
      .select({
        invoiceId: invoices.id,
        chargeAttempts: invoices.chargeAttempts,
        nextChargeAttemptAt: invoices.nextChargeAttemptAt,
        status: invoices.status,
        gatewayChargeStatus: invoices.gatewayChargeStatus,
      })
      .from(invoices)
      .innerJoin(
        studentSubscriptions,
        and(
          eq(studentSubscriptions.studentId, invoices.studentId),
          eq(studentSubscriptions.tenantId, invoices.tenantId),
          eq(studentSubscriptions.active, true),
          eq(studentSubscriptions.autoRenew, true),
        ),
      )
      .where(
        and(
          eq(invoices.tenantId, tenantId),
          eq(invoices.status, "open"),
          lte(invoices.dueAt, now),
          or(
            isNull(invoices.nextChargeAttemptAt),
            lte(invoices.nextChargeAttemptAt, now),
          ),
        ),
      );
  });

  const result: ChargeRunResult = { attempted: 0, charged: 0, failed: 0 };

  for (const row of rows) {
    if (
      !isChargeableNow({
        status: row.status,
        chargeAttempts: row.chargeAttempts,
        nextChargeAttemptAt: row.nextChargeAttemptAt,
        now,
      })
    ) {
      continue;
    }
    if (row.chargeAttempts >= MAX_CHARGE_ATTEMPTS) continue;
    result.attempted++;

    const charge = await chargeInvoiceOnStone({
      tenantId,
      invoiceId: row.invoiceId,
    });
    if (charge.ok) {
      result.charged++;
    } else if (charge.http === 409) {
      result.charged++;
    } else {
      result.failed++;
    }
  }

  return result;
}

export async function chargeDueInvoicesAll(
  now: Date = new Date(),
): Promise<{ tenants: number } & ChargeRunResult> {
  const tenantRows = await withBypassRlsTransaction(async (tx) => {
    return tx
      .selectDistinct({ tenantId: studentSubscriptions.tenantId })
      .from(studentSubscriptions)
      .where(
        and(
          eq(studentSubscriptions.active, true),
          eq(studentSubscriptions.autoRenew, true),
        ),
      );
  });

  const total: { tenants: number } & ChargeRunResult = {
    tenants: tenantRows.length,
    attempted: 0,
    charged: 0,
    failed: 0,
  };
  for (const { tenantId } of tenantRows) {
    const r = await chargeDueInvoicesForTenant(tenantId, now);
    total.attempted += r.attempted;
    total.charged += r.charged;
    total.failed += r.failed;
  }
  return total;
}
