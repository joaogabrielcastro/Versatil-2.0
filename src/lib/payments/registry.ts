import type { PaymentProvider } from "@/lib/payments/provider";
import { providerSupports } from "@/lib/payments/provider";
import { manualProvider } from "@/lib/payments/providers/manual";
import { stoneConnectProvider } from "@/lib/payments/providers/stone-connect";
import type {
  PaymentCapability,
  PaymentProviderId,
} from "@/lib/payments/types";

const REGISTRY: Record<PaymentProviderId, PaymentProvider> = {
  manual: manualProvider,
  stone_connect: stoneConnectProvider,
};

export function getPaymentProvider(id: PaymentProviderId): PaymentProvider {
  return REGISTRY[id];
}

export function listPaymentProviders(): PaymentProvider[] {
  return Object.values(REGISTRY);
}

export function providersWithCapability(
  capability: PaymentCapability,
): PaymentProvider[] {
  return listPaymentProviders().filter((p) =>
    providerSupports(p, capability),
  );
}
