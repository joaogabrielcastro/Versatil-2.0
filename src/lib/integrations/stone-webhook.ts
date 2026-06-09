import { z } from "zod";

/**
 * Contrato interno para webhooks Stone (Fase 2).
 * Quando tiver acesso à API Stone, mapeie o payload deles para este formato
 * antes de enfileirar no processador de webhooks.
 */
export const stoneWebhookBodySchema = z.object({
  tenantId: z.string().uuid(),
  eventId: z.string().min(1).max(255),
  type: z.enum(["invoice.paid", "invoice.payment_failed"]),
  invoiceId: z.string().uuid(),
  stoneChargeId: z.string().max(255).optional(),
  raw: z.unknown().optional(),
});

export type StoneWebhookBody = z.infer<typeof stoneWebhookBodySchema>;
