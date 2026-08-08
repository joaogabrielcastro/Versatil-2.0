import type { PaymentProvider } from "@/lib/payments/provider";
import { providerSupports } from "@/lib/payments/provider";
import { manualProvider } from "@/lib/payments/providers/manual";
import { pagarmeProvider } from "@/lib/payments/providers/pagarme";
import { stoneConnectProvider } from "@/lib/payments/providers/stone-connect";
import type {
  PaymentCapability,
  PaymentProviderId,
} from "@/lib/payments/types";

const REGISTRY: Record<PaymentProviderId, PaymentProvider> = {
  manual: manualProvider,
  pagarme: pagarmeProvider,
  stone_connect: stoneConnectProvider,
};

/** Retorna o provedor pelo id. */
export function getPaymentProvider(id: PaymentProviderId): PaymentProvider {
  return REGISTRY[id];
}

/** Lista todos os provedores registrados. */
export function listPaymentProviders(): PaymentProvider[] {
  return Object.values(REGISTRY);
}

/** Provedores que suportam uma capability específica. */
export function providersWithCapability(
  capability: PaymentCapability,
): PaymentProvider[] {
  return listPaymentProviders().filter((p) =>
    providerSupports(p, capability),
  );
}
