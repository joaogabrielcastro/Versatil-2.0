import "server-only";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  DATABASE_URL: z
    .string()
    .min(1, "DATABASE_URL é obrigatória")
    .refine(
      (v) =>
        v.startsWith("postgres://") || v.startsWith("postgresql://"),
      "DATABASE_URL deve ser uma connection string PostgreSQL",
    ),
  REDIS_URL: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(3000),
  JWT_SECRET: z.string().min(32, "JWT_SECRET deve ter ao menos 32 caracteres"),
  NEXTAUTH_SECRET: z
    .string()
    .min(32, "NEXTAUTH_SECRET deve ter ao menos 32 caracteres"),
  /** Opcional: desativa migrações no start (ex.: job workers) */
  SKIP_MIGRATIONS: z.enum(["true", "false"]).optional(),
});

export type Env = z.infer<typeof envSchema>;

function readEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const msg = parsed.error.flatten().fieldErrors;
    console.error("Variáveis de ambiente inválidas:", msg);
    throw new Error("Falha na validação de ambiente (Zod). Verifique o .env.");
  }
  return parsed.data;
}

let cached: Env | null = null;

export function getEnv(): Env {
  if (!cached) {
    cached = readEnv();
  }
  return cached;
}
