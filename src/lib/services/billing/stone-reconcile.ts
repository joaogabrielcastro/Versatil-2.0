import { and, eq, isNotNull, lt } from "drizzle-orm";
import { invoices } from "@/lib/db/schema";
import {
  withBypassRlsTransaction,
  withTenantTransaction,
  type DbTransaction,
} from "@/lib/db/with-tenant";
import type { ChargeStatusResult } from "@/lib/payments/provider";
import { log } from "@/lib/observability/logger";
import { stoneConnectProvider } from "@/lib/payments/providers/stone-connect";
import { nextStateAfterPaymentFailed } from "@/lib/payments/recurring";
import { recalculateStudentStatus } from "@/lib/services/student-status";

export const MAX_RECONCILE_ATTEMPTS = 5;

const MANUAL =
  "Conciliação manual necessária: a Stone não confirmou valor e moeda desta cobrança.";

export type ChargeStatusReader = (
  tenantId: string,
  externalId: string,
) => Promise<ChargeStatusResult>;

export async function reconcilePendingStoneCharges(
  readStatus: ChargeStatusReader = (tenantId, externalId) =>
    stoneConnectProvider.getChargeStatus!(tenantId, externalId),
): Promise<{
  checked: number;
  paid: number;
  failed: number;
  needsManual: number;
  failedTenantIds: string[];
}> {
  const pending = await withBypassRlsTransaction(async (tx) => {
    return tx
      .select({
        id: invoices.id,
        tenantId: invoices.tenantId,
        externalId: invoices.externalId,
      })
      .from(invoices)
      .where(
        and(
          eq(invoices.status, "open"),
          eq(invoices.gatewayChargeStatus, "pending"),
          isNotNull(invoices.externalId),
          lt(invoices.reconcileAttempts, MAX_RECONCILE_ATTEMPTS),
        ),
      );
  });

  const result = {
    checked: 0,
    paid: 0,
    failed: 0,
    needsManual: 0,
    failedTenantIds: [] as string[],
  };

  for (const row of pending) {
    if (!row.externalId) continue;
    result.checked++;
    try {
    const outcome = await reconcileOne(row, readStatus);
    if (outcome === "paid") result.paid++;
    else if (outcome === "failed") result.failed++;
    else if (outcome === "manual") result.needsManual++;
    } catch (err) {
      if (!result.failedTenantIds.includes(row.tenantId)) {
        result.failedTenantIds.push(row.tenantId);
      }
      log.error("cron.tenant_failed", {
        job: "reconcile-stone",
        tenantId: row.tenantId,
        error: err instanceof Error ? err.message : "erro",
      });
    }
  }

  return result;
}

async function reconcileOne(
  row: { id: string; tenantId: string; externalId: string | null },
  readStatus: ChargeStatusReader,
): Promise<"paid" | "failed" | "manual" | "pending" | "skip"> {
  if (!row.externalId) return "skip";
  let remote: ChargeStatusResult;
  try {
    remote = await readStatus(row.tenantId, row.externalId);
  } catch {
    const manual = await noteReconcileFailure(row.tenantId, row.id, "Falha ao consultar a Stone.");
    return manual ? "manual" : "skip";
  }

  const applied = await withTenantTransaction(row.tenantId, async (tx) => {
      const [inv] = await tx
        .select({
          id: invoices.id,
          studentId: invoices.studentId,
          status: invoices.status,
          amountCents: invoices.amountCents,
          currency: invoices.currency,
          externalId: invoices.externalId,
          chargeAttempts: invoices.chargeAttempts,
          reconcileAttempts: invoices.reconcileAttempts,
          gatewayChargeStatus: invoices.gatewayChargeStatus,
        })
        .from(invoices)
        .where(and(eq(invoices.id, row.id), eq(invoices.tenantId, row.tenantId)))
        .for("update")
        .limit(1);
      if (!inv || inv.status !== "open" || inv.gatewayChargeStatus !== "pending") {
        return "skip" as const;
      }
      if (inv.externalId !== row.externalId) return "skip" as const;

      if (remote.status === "paid") {
        const amountOk = remote.amountCents === inv.amountCents;
        const currencyOk =
          remote.currency?.toUpperCase() === inv.currency.trim().toUpperCase();
        if (!amountOk || !currencyOk || remote.externalId !== inv.externalId) {
          return bump(tx, inv, "Consulta paga sem valor, moeda ou cobrança compatíveis.");
        }
        await tx
          .update(invoices)
          .set({
            status: "paid",
            paidAt: new Date(),
            settlementSource: "automatic_gateway",
            gatewayChargeStatus: "succeeded",
            lastChargeError: null,
            nextChargeAttemptAt: null,
          })
          .where(and(eq(invoices.id, inv.id), eq(invoices.tenantId, row.tenantId)));
        return "paid" as const;
      }

      if (remote.status === "failed") {
        const next = nextStateAfterPaymentFailed({
          invoiceStatus: inv.status,
          chargeAttempts: inv.chargeAttempts,
        });
        if (!next.skip) {
          await tx
            .update(invoices)
            .set({
              status: next.invoiceStatus,
              gatewayChargeStatus: next.gatewayChargeStatus,
              nextChargeAttemptAt: next.nextChargeAttemptAt,
              lastChargeError: "Pagamento recusado na conciliação Stone.",
            })
            .where(and(eq(invoices.id, inv.id), eq(invoices.tenantId, row.tenantId)));
        }
        return "failed" as const;
      }

      return bump(tx, inv, "Cobrança ainda pendente na Stone.");
    });

  if (applied === "paid") {
    const [inv] = await withTenantTransaction(row.tenantId, async (tx) => {
      return tx
        .select({ studentId: invoices.studentId })
        .from(invoices)
        .where(eq(invoices.id, row.id))
        .limit(1);
    });
    if (inv) await recalculateStudentStatus(row.tenantId, inv.studentId);
  }
  return applied;
}

async function noteReconcileFailure(tenantId: string, invoiceId: string, message: string) {
  return withTenantTransaction(tenantId, async (tx) => {
    const [inv] = await tx
      .select({
        reconcileAttempts: invoices.reconcileAttempts,
      })
      .from(invoices)
      .where(and(eq(invoices.id, invoiceId), eq(invoices.tenantId, tenantId)))
      .for("update")
      .limit(1);
    if (!inv) return false;
    const attempts = inv.reconcileAttempts + 1;
    await tx
      .update(invoices)
      .set({
        reconcileAttempts: attempts,
        lastChargeError: attempts >= MAX_RECONCILE_ATTEMPTS ? MANUAL : message.slice(0, 500),
      })
      .where(and(eq(invoices.id, invoiceId), eq(invoices.tenantId, tenantId)));
    return attempts >= MAX_RECONCILE_ATTEMPTS;
  });
}

async function bump(
  tx: DbTransaction,
  inv: { id: string; reconcileAttempts: number },
  message: string,
): Promise<"manual" | "pending"> {
  const attempts = inv.reconcileAttempts + 1;
  await tx
    .update(invoices)
    .set({
      reconcileAttempts: attempts,
      lastChargeError: attempts >= MAX_RECONCILE_ATTEMPTS ? MANUAL : message.slice(0, 500),
    })
    .where(eq(invoices.id, inv.id));
  return attempts >= MAX_RECONCILE_ATTEMPTS ? "manual" : "pending";
}
