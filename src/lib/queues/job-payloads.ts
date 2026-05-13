import { z } from "zod";

export const webhookJobSchema = z.object({
  tenantId: z.string().uuid(),
  provider: z.enum(["stripe", "asaas"]),
  eventId: z.string().min(1).max(255),
  type: z.string().min(1).max(128),
  invoiceId: z.string().uuid().optional(),
  raw: z.unknown().optional(),
});

export type WebhookJobPayload = z.infer<typeof webhookJobSchema>;

export const importJobPayloadSchema = z.object({
  importJobId: z.string().uuid(),
  tenantId: z.string().uuid(),
  mapping: z.record(z.string(), z.string()),
  rows: z.array(z.record(z.string(), z.string())).max(2000),
});

export type ImportJobPayload = z.infer<typeof importJobPayloadSchema>;

export const turnstileSyncJobSchema = z.object({
  tenantId: z.string().uuid(),
  studentId: z.string().uuid().optional(),
  deviceId: z.string().uuid().optional(),
  allowed: z.boolean().optional(),
  reason: z.string().max(255).optional().nullable(),
  accessEventId: z.string().uuid().optional(),
});

export type TurnstileSyncJobPayload = z.infer<typeof turnstileSyncJobSchema>;
