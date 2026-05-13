import { eq } from "drizzle-orm";
import { tenantPaymentSettings } from "@/lib/db/schema";
import { withTenantTransaction } from "@/lib/db/with-tenant";
import { decryptJson, getPaymentSecretKey } from "@/lib/crypto/payment-secret";
import { getEnv } from "@/lib/env";

type TenantCreds = {
  stripeSecretKey?: string;
  stripeWebhookSecret?: string;
  asaasApiKey?: string;
};

/** Secret Stripe: variável global (MVP) ou credencial cifrada do tenant. */
export async function resolveStripeSecretKey(
  tenantId: string,
): Promise<string | null> {
  const env = getEnv();
  if (env.STRIPE_SECRET_KEY) {
    return env.STRIPE_SECRET_KEY;
  }
  return withTenantTransaction(tenantId, async (tx) => {
    const [row] = await tx
      .select()
      .from(tenantPaymentSettings)
      .where(eq(tenantPaymentSettings.tenantId, tenantId))
      .limit(1);
    if (!row || row.gateway !== "stripe") {
      return null;
    }
    try {
      const key = getPaymentSecretKey(env);
      const creds = decryptJson<TenantCreds>(row.encryptedCredentials, key);
      return creds.stripeSecretKey ?? null;
    } catch {
      return null;
    }
  });
}
