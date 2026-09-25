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
  /** Bearer para GET /api/cron/recalculate-students (Coolify / cron externo) */
  CRON_SECRET: z.string().min(8).optional(),
  /** Legado. POST /api/webhooks/gateway não liquida mais faturas. */
  WEBHOOK_INGEST_SECRET: z.string().min(16).optional(),
  /** Login membro de versatil_platform. Sem isto, o bypass usa DATABASE_URL. */
  PLATFORM_DATABASE_URL: z
    .string()
    .refine(
      (v) => v.startsWith("postgres://") || v.startsWith("postgresql://"),
      "PLATFORM_DATABASE_URL deve ser PostgreSQL",
    )
    .optional(),
  /** Ignorado. O compose não tem proxy; não use X-Forwarded-For. */
  TRUST_PROXY: z.enum(["true", "false"]).optional(),
  /**
   * Cabeçalho único que o proxy substitui (não encadeia).
   * `x-forwarded-for` é recusado. Sem isso o IP do cliente fica "direct".
   */
  CLIENT_IP_HEADER: z.string().min(1).max(64).optional(),
  /** Bearer do contrato interno POST /api/webhooks/stone */
  STONE_WEBHOOK_SECRET: z.string().min(16).optional(),
  /**
   * Legado. Tokens de kiosk são por academia (`kiosk_devices`).
   * Mantido só para compatibilidade de .env antigo — não autoriza acesso.
   */
  KIOSK_ACCESS_SECRET: z.string().min(16).optional(),
  /** 64 hex chars (32 bytes). Obrigatória em produção; em dev/test deriva de JWT se ausente. */
  PAYMENT_ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, "PAYMENT_ENCRYPTION_KEY deve ser 64 caracteres hex")
    .optional(),
  /** URL pública do app (links absolutos, webhooks) */
  APP_URL: z.string().url().optional(),
  /** Push opcional para hardware de catraca */
  TURNSTILE_PUSH_URL: z.string().url().optional(),
  /** Nome no campo `service` dos logs JSON (default: versatil-worker) */
  OBSERVABILITY_SERVICE: z.string().min(1).max(64).optional(),
  /** `json` = uma linha JSON por log; `text` = legível no terminal */
  OBSERVABILITY_LOG_FORMAT: z.enum(["json", "text"]).optional(),
  /** Intervalo em ms para métricas de fila (snapshot); default 60000 */
  OBSERVABILITY_METRICS_INTERVAL_MS: z.coerce
    .number()
    .int()
    .positive()
    .max(600_000)
    .optional(),
  /** POST JSON quando há alerta (Slack incoming, n8n, PagerDuty, etc.) */
  OBSERVABILITY_ALERT_WEBHOOK_URL: z.string().url().optional(),
  /** Bearer opcional para o webhook de alertas */
  OBSERVABILITY_ALERT_WEBHOOK_TOKEN: z.string().min(8).optional(),
  /** Se waiting > este valor, envia alerta `bull.queue_backlog` (0 = desligado) */
  OBSERVABILITY_ALERT_QUEUE_WAITING_THRESHOLD: z.coerce
    .number()
    .int()
    .nonnegative()
    .max(1_000_000)
    .optional(),
});

export type Env = z.infer<typeof envSchema>;

function readEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const msg = parsed.error.flatten().fieldErrors;
    console.error("Variáveis de ambiente inválidas:", msg);
    throw new Error("Falha na validação de ambiente (Zod). Verifique o .env.");
  }
  if (parsed.data.NODE_ENV === "production" && !parsed.data.PAYMENT_ENCRYPTION_KEY) {
    throw new Error(
      "PAYMENT_ENCRYPTION_KEY é obrigatória em produção (64 caracteres hex).",
    );
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
