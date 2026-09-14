import { and, eq } from "drizzle-orm";
import {
  decryptJson,
  encryptJson,
  getPaymentSecretKey,
} from "@/lib/crypto/payment-secret";
import { paymentProviderConfigs } from "@/lib/db/schema";
import type { DbTransaction } from "@/lib/db/with-tenant";
import { withTenantTransaction } from "@/lib/db/with-tenant";
import { getEnv } from "@/lib/env";
import type { PaymentProviderId } from "@/lib/payments/types";

/** Credenciais do Stone Connect (maquininha POS). */
export interface StoneConnectCredentials {
  /** Secret key da conta habilitada para Stone Connect (API Core v5). */
  secretKey: string;
  /** ID da empresa no Stone Partner Program (header ServiceRefererName). */
  serviceRefererName: string;
  /** Serial padrão do POS (quando o caixa não escolhe um). */
  defaultTerminalSerial?: string;
  /** Tipo de pagamento padrão na maquininha. */
  paymentType?: "credit" | "debit";
  /** Segredo HMAC do webhook Core (`X-Hub-Signature`). */
  webhookSecret?: string;
}

export type ProviderCredentials = StoneConnectCredentials &
  Record<string, unknown>;

export interface ProviderConfig<C = ProviderCredentials> {
  provider: PaymentProviderId;
  enabled: boolean;
  credentials: C;
  updatedAt: Date;
}

function decrypt<C>(blob: string): C | null {
  try {
    return decryptJson<C>(blob, getPaymentSecretKey(getEnv()));
  } catch {
    return null;
  }
}

/** Lê a config de um provedor dentro de uma transação de tenant. */
export async function getProviderConfigTx<C = ProviderCredentials>(
  tx: DbTransaction,
  tenantId: string,
  provider: PaymentProviderId,
): Promise<ProviderConfig<C> | null> {
  const [row] = await tx
    .select()
    .from(paymentProviderConfigs)
    .where(
      and(
        eq(paymentProviderConfigs.tenantId, tenantId),
        eq(paymentProviderConfigs.provider, provider),
      ),
    )
    .limit(1);
  if (!row) return null;
  const credentials = decrypt<C>(row.encryptedCredentials);
  if (!credentials) return null;
  return {
    provider,
    enabled: row.enabled,
    credentials,
    updatedAt: row.updatedAt,
  };
}

/** Lê a config de um provedor (abre transação de tenant). */
export async function getProviderConfig<C = ProviderCredentials>(
  tenantId: string,
  provider: PaymentProviderId,
): Promise<ProviderConfig<C> | null> {
  return withTenantTransaction(tenantId, (tx) =>
    getProviderConfigTx<C>(tx, tenantId, provider),
  );
}

/** Retorna a config apenas se o provedor estiver habilitado. */
export async function getEnabledProviderConfig<C = ProviderCredentials>(
  tenantId: string,
  provider: PaymentProviderId,
): Promise<ProviderConfig<C> | null> {
  const cfg = await getProviderConfig<C>(tenantId, provider);
  return cfg && cfg.enabled ? cfg : null;
}

/** Cria/atualiza a config de um provedor, mesclando credenciais existentes. */
export async function upsertProviderConfig(
  tenantId: string,
  provider: PaymentProviderId,
  input: { enabled?: boolean; credentials?: Partial<ProviderCredentials> },
): Promise<void> {
  await withTenantTransaction(tenantId, async (tx) => {
    const existing = await getProviderConfigTx(tx, tenantId, provider);
    const mergedCreds: ProviderCredentials = {
      ...(existing?.credentials ?? {}),
      ...(input.credentials ?? {}),
    } as ProviderCredentials;

    const blob = encryptJson(mergedCreds, getPaymentSecretKey(getEnv()));
    const enabled = input.enabled ?? existing?.enabled ?? true;
    const now = new Date();

    if (existing) {
      await tx
        .update(paymentProviderConfigs)
        .set({ enabled, encryptedCredentials: blob, updatedAt: now })
        .where(
          and(
            eq(paymentProviderConfigs.tenantId, tenantId),
            eq(paymentProviderConfigs.provider, provider),
          ),
        );
    } else {
      await tx.insert(paymentProviderConfigs).values({
        tenantId,
        provider,
        enabled,
        encryptedCredentials: blob,
      });
    }
  });
}
