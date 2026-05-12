import { z } from "zod";

export const sessionPayloadSchema = z
  .object({
    sub: z.string().uuid(),
    typ: z.enum(["tenant", "platform"]),
    tid: z
      .union([z.string().uuid(), z.null()])
      .optional()
      .transform((v) => v ?? null),
    role: z.enum(["super_admin", "tenant_admin", "tenant_user"]),
  })
  .superRefine((val, ctx) => {
    if (val.typ === "tenant" && val.tid === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Sessão de academia exige tenant (tid).",
        path: ["tid"],
      });
    }
    if (val.typ === "platform" && val.tid !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Sessão de plataforma não deve carregar tenant.",
        path: ["tid"],
      });
    }
    if (val.typ === "platform" && val.role !== "super_admin") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Perfil de plataforma inválido.",
        path: ["role"],
      });
    }
  });

export type SessionPayload = z.infer<typeof sessionPayloadSchema>;
