import { z } from "zod";

/**
 * Contrato interno para webhooks Stone (Fase 2).
 * Quando tiver acesso à API Stone, mapeie o payload deles para este formato
 * antes de enfileirar no processador de webhooks.
 */
export const stoneWebhookBodySchema = z
  .object({
    tenantId: z.string().uuid(),
    eventId: z.string().min(1).max(255),
    type: z.enum(["invoice.paid", "invoice.payment_failed"]),
    invoiceId: z.string().uuid(),
    stoneChargeId: z.string().min(1).max(255),
    amountCents: z.number().int().nonnegative().optional(),
    currency: z.string().trim().length(3).optional(),
    raw: z.unknown().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.type !== "invoice.paid") return;
    if (data.amountCents === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["amountCents"],
        message: "invoice.paid exige amountCents.",
      });
    }
    if (!data.currency) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["currency"],
        message: "invoice.paid exige currency.",
      });
    }
  });

export type StoneWebhookBody = z.infer<typeof stoneWebhookBodySchema>;
