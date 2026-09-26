import {
  pgTable,
  uuid,
  text,
  timestamp,
  varchar,
  pgEnum,
  integer,
  boolean,
  jsonb,
  uniqueIndex,
  index,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const userRoleEnum = pgEnum("tenant_user_role", [
  "tenant_admin",
  "tenant_user",
]);

export const studentStatusEnum = pgEnum("student_status", [
  "active",
  "delinquent",
  "inactive",
]);

export const invoiceStatusEnum = pgEnum("invoice_status", [
  "draft",
  "open",
  "paid",
  "void",
  "uncollectible",
]);

export const settlementSourceEnum = pgEnum("settlement_source", [
  "automatic_gateway",
  "manual_reception",
]);

export const billingIntervalEnum = pgEnum("billing_interval", [
  "monthly",
  "quarterly",
  "semesterly",
  "yearly",
]);

export const paymentGatewayEnum = pgEnum("payment_gateway", [
  "stripe",
]);

export const importJobStatusEnum = pgEnum("import_job_status", [
  "queued",
  "processing",
  "completed",
  "failed",
]);

export const timelineEventTypeEnum = pgEnum("invoice_timeline_event_type", [
  "gateway_charge",
  "gateway_failure",
  "manual_payment",
  "note",
  "webhook_received",
]);

export const stockMovementTypeEnum = pgEnum("stock_movement_type", [
  "in",
  "out",
  "adjust",
  "sale",
]);

export const tenants = pgTable("tenants", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 64 }).notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const cronRuns = pgTable("cron_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  job: varchar("job", { length: 64 }).notNull(),
  ok: boolean("ok").notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }).notNull().defaultNow(),
  summary: jsonb("summary").$type<Record<string, unknown>>().notNull().default({}),
  error: varchar("error", { length: 500 }),
});

export const platformAdmins = pgTable("platform_admins", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  sessionVersion: integer("session_version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const tenantUsers = pgTable(
  "tenant_users",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    email: varchar("email", { length: 255 }).notNull(),
    passwordHash: text("password_hash").notNull(),
    role: userRoleEnum("role").notNull().default("tenant_user"),
    sessionVersion: integer("session_version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("tenant_users_tenant_email").on(t.tenantId, t.email),
    index("tenant_users_tenant_idx").on(t.tenantId),
  ],
);

export const students = pgTable(
  "students",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    fullName: varchar("full_name", { length: 255 }).notNull(),
    cpf: varchar("cpf", { length: 14 }).notNull(),
    email: varchar("email", { length: 255 }),
    whatsapp: varchar("whatsapp", { length: 32 }),
    birthDate: timestamp("birth_date", { mode: "date" }),
    /** Referência a blob/URL de foto ou embedding — MVP como texto opcional */
    facialVectorRef: text("facial_vector_ref"),
    status: studentStatusEnum("status").notNull().default("inactive"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("students_tenant_cpf").on(t.tenantId, t.cpf),
    index("students_tenant_email_idx").on(t.tenantId, t.email),
    index("students_tenant_idx").on(t.tenantId),
  ],
);

export const plans = pgTable(
  "plans",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    /** Código estável da tabela da academia. A carga não duplica este valor. */
    code: varchar("code", { length: 64 }),
    category: varchar("category", { length: 64 }),
    /** subscription = mensalidade; fee = cobrança única (matrícula, avaliação…). */
    kind: varchar("kind", { length: 32 }).notNull().default("subscription"),
    /**
     * Efeito de uma taxa vencida na catraca. Vale para cobranças futuras.
     * block = impede acesso; none = só financeiro; null = sem classificação.
     */
    accessEffect: varchar("access_effect", { length: 16 }),
    /**
     * Prazo comercial em meses. No mensal, é o número de parcelas.
     * No trimestral/semestral/anual, indica pagamento à vista de um ciclo.
     */
    termMonths: integer("term_months"),
    priceCents: integer("price_cents").notNull(),
    billingInterval: billingIntervalEnum("billing_interval")
      .notNull()
      .default("monthly"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("plans_tenant_idx").on(t.tenantId),
    uniqueIndex("plans_tenant_code")
      .on(t.tenantId, t.code)
      .where(sql`${t.code} IS NOT NULL`),
    check(
      "plans_kind_check",
      sql`${t.kind} IN ('subscription', 'fee')`,
    ),
    check(
      "plans_access_effect_check",
      sql`${t.accessEffect} IS NULL OR ${t.accessEffect} IN ('block', 'none')`,
    ),
    check(
      "plans_term_months_positive",
      sql`${t.termMonths} IS NULL OR ${t.termMonths} > 0`,
    ),
  ],
);

export const classActivities = pgTable(
  "class_activities",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    category: varchar("category", { length: 64 }).notNull(),
    code: varchar("code", { length: 64 }),
    sortOrder: integer("sort_order").notNull().default(0),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("class_activities_tenant_idx").on(t.tenantId),
    uniqueIndex("class_activities_tenant_code")
      .on(t.tenantId, t.code)
      .where(sql`${t.code} IS NOT NULL`),
  ],
);

export const classSlots = pgTable(
  "class_slots",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    activityId: uuid("activity_id")
      .notNull()
      .references(() => classActivities.id, { onDelete: "cascade" }),
    /** 1 = segunda … 5 = sexta. */
    weekday: integer("weekday").notNull(),
    /** Horário local HH:MM. */
    startTime: varchar("start_time", { length: 5 }).notNull(),
  },
  (t) => [
    index("class_slots_activity_idx").on(t.activityId),
    index("class_slots_tenant_idx").on(t.tenantId),
    uniqueIndex("class_slots_activity_weekday_time").on(
      t.activityId,
      t.weekday,
      t.startTime,
    ),
    check("class_slots_weekday", sql`${t.weekday} BETWEEN 1 AND 5`),
    check(
      "class_slots_start_time",
      sql`${t.startTime} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'`,
    ),
  ],
);

export const studentSubscriptions = pgTable(
  "student_subscriptions",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    planId: uuid("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "restrict" }),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    active: boolean("active").notNull().default(true),
    /** Legado. O envio à maquininha está em autoChargePos. */
    autoRenew: boolean("auto_renew").notNull().default(false),
    /** Envia faturas em aberto à maquininha. Não renova o contrato. */
    autoChargePos: boolean("auto_charge_pos").notNull().default(false),
    priceCents: integer("price_cents").notNull(),
    billingInterval: varchar("billing_interval", { length: 32 }).notNull(),
    cancelRequestedAt: timestamp("cancel_requested_at", { withTimezone: true }),
    cancelEffectiveAt: timestamp("cancel_effective_at", { withTimezone: true }),
    cancelReason: varchar("cancel_reason", { length: 500 }),
    cancelRequestedBy: uuid("cancel_requested_by"),
    scheduledPlanId: uuid("scheduled_plan_id"),
    scheduledPriceCents: integer("scheduled_price_cents"),
    scheduledBillingInterval: varchar("scheduled_billing_interval", { length: 32 }),
    scheduledEffectiveAt: timestamp("scheduled_effective_at", { withTimezone: true }),
    /** Provedor da recorrência (produto: stone_connect). */
    provider: varchar("provider", { length: 32 }),
    /** IDs externos do provedor (legado; recorrência atual não usa cartão salvo). */
    externalCustomerId: varchar("external_customer_id", { length: 255 }),
    externalCardId: varchar("external_card_id", { length: 255 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("student_subscriptions_tenant_idx").on(t.tenantId),
    index("student_subscriptions_student_idx").on(t.studentId),
  ],
);

export const subscriptionTerms = pgTable("subscription_terms", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  subscriptionId: uuid("subscription_id")
    .notNull()
    .references(() => studentSubscriptions.id, { onDelete: "cascade" }),
  planId: uuid("plan_id")
    .notNull()
    .references(() => plans.id, { onDelete: "restrict" }),
  priceCents: integer("price_cents").notNull(),
  billingInterval: varchar("billing_interval", { length: 32 }).notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  /** A partir de quando o preço deste termo pode gerar fatura. Termo migration usa created_at, não starts_at. */
  validFrom: timestamp("valid_from", { withTimezone: true }).notNull(),
  source: varchar("source", { length: 32 }).notNull(),
  createdBy: uuid("created_by"),
  note: varchar("note", { length: 500 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const paymentConflicts = pgTable(
  "payment_conflicts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    chargeId: varchar("charge_id", { length: 255 }).notNull(),
    eventId: varchar("event_id", { length: 255 }).notNull(),
    amountCents: integer("amount_cents").notNull(),
    currency: varchar("currency", { length: 3 }).notNull(),
    reason: varchar("reason", { length: 500 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("payment_conflicts_tenant_invoice_charge").on(t.tenantId, t.invoiceId, t.chargeId)],
);

export const billingReviews = pgTable(
  "billing_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    subscriptionId: uuid("subscription_id")
      .notNull()
      .references(() => studentSubscriptions.id, { onDelete: "cascade" }),
    periodKey: varchar("period_key", { length: 255 }).notNull(),
    reason: varchar("reason", { length: 500 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("billing_reviews_tenant_period").on(t.tenantId, t.periodKey)],
);

export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    amountCents: integer("amount_cents").notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("BRL"),
    status: invoiceStatusEnum("status").notNull().default("open"),
    dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    settlementSource: settlementSourceEnum("settlement_source"),
    externalId: varchar("external_id", { length: 255 }),
    idempotencyKey: varchar("idempotency_key", { length: 255 }),
    /** subscription = mensalidade; fee = taxa avulsa; manual = valor livre. */
    purpose: varchar("purpose", { length: 32 }),
    /**
     * Cópia da política da taxa no lançamento. null em fatura antiga
     * continua podendo bloquear até revisão administrativa.
     */
    accessEffect: varchar("access_effect", { length: 16 }),
    /** Recorrência automática: nº de tentativas de cobrança e backoff. */
    chargeAttempts: integer("charge_attempts").notNull().default(0),
    nextChargeAttemptAt: timestamp("next_charge_attempt_at", {
      withTimezone: true,
    }),
    lastChargeError: text("last_charge_error"),
    /** idle | pending | succeeded | failed | canceled — cobrança no gateway. */
    gatewayChargeStatus: varchar("gateway_charge_status", { length: 32 })
      .notNull()
      .default("idle"),
    /** Chave estável enviada à Stone nesta tentativa. Não reutilizar para outra tentativa. */
    gatewayIdempotencyKey: varchar("gateway_idempotency_key", { length: 255 }),
    reconcileAttempts: integer("reconcile_attempts").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("invoices_tenant_student_idx").on(t.tenantId, t.studentId),
    index("invoices_tenant_due_idx").on(t.tenantId, t.dueAt),
    uniqueIndex("invoices_tenant_idempotency").on(
      t.tenantId,
      t.idempotencyKey,
    ),
    check(
      "invoices_purpose_check",
      sql`${t.purpose} IS NULL OR ${t.purpose} IN ('subscription', 'fee', 'manual')`,
    ),
    check(
      "invoices_access_effect_check",
      sql`${t.accessEffect} IS NULL OR ${t.accessEffect} IN ('block', 'none')`,
    ),
  ],
);

export const invoiceTimelineEvents = pgTable(
  "invoice_timeline_events",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    type: timelineEventTypeEnum("type").notNull(),
    payload: jsonb("payload"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("invoice_timeline_tenant_invoice_idx").on(t.tenantId, t.invoiceId),
  ],
);

export const tenantPaymentSettings = pgTable(
  "tenant_payment_settings",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" })
      .unique(),
    gateway: paymentGatewayEnum("gateway").notNull(),
    /** Ciphertext + metadados (KMS/app key) — MVP: armazenar como texto cifrado */
    encryptedCredentials: text("encrypted_credentials").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("tenant_payment_settings_tenant_idx").on(t.tenantId)],
);

/**
 * Configuração de provedores de pagamento por tenant.
 * Produto: `stone_connect` (maquininha). Credenciais cifradas.
 */
export const paymentProviderConfigs = pgTable(
  "payment_provider_configs",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    provider: varchar("provider", { length: 32 }).notNull(),
    enabled: boolean("enabled").notNull().default(true),
    encryptedCredentials: text("encrypted_credentials").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("payment_provider_configs_tenant_provider").on(
      t.tenantId,
      t.provider,
    ),
    index("payment_provider_configs_tenant_idx").on(t.tenantId),
  ],
);

export const turnstileDevices = pgTable(
  "turnstile_devices",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    /** Hash do token de dispositivo (nunca armazenar token puro) */
    tokenHash: text("token_hash").notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("turnstile_devices_tenant_idx").on(t.tenantId),
    uniqueIndex("turnstile_devices_token_hash").on(t.tokenHash),
  ],
);

/** Terminal de impressão de treino — credencial por academia/dispositivo. */
export const kioskDevices = pgTable(
  "kiosk_devices",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("kiosk_devices_tenant_idx").on(t.tenantId),
    uniqueIndex("kiosk_devices_token_hash").on(t.tokenHash),
  ],
);

export const accessEvents = pgTable(
  "access_events",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    studentId: uuid("student_id").references(() => students.id, {
      onDelete: "set null",
    }),
    deviceId: uuid("device_id").references(() => turnstileDevices.id, {
      onDelete: "set null",
    }),
    allowed: boolean("allowed").notNull(),
    reason: varchar("reason", { length: 255 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("access_events_tenant_created_idx").on(t.tenantId, t.createdAt),
  ],
);

export const importJobs = pgTable(
  "import_jobs",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    createdByUserId: uuid("created_by_user_id").references(
      () => tenantUsers.id,
      { onDelete: "set null" },
    ),
    status: importJobStatusEnum("status").notNull().default("queued"),
    /** Caminho S3/local — MVP: nome do arquivo enviado */
    fileKey: text("file_key").notNull(),
    columnMapping: jsonb("column_mapping").notNull(),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [index("import_jobs_tenant_idx").on(t.tenantId)],
);

export const webhookDedupe = pgTable(
  "webhook_dedupe",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    provider: varchar("provider", { length: 32 }).notNull(),
    eventId: varchar("event_id", { length: 255 }).notNull(),
    /** received | processing | processed | failed */
    status: varchar("status", { length: 32 }).notNull().default("received"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("webhook_dedupe_tenant_provider_event").on(
      t.tenantId,
      t.provider,
      t.eventId,
    ),
  ],
);

/** Modelos de treino da academia (pré-fixados ou criados no balcão). */
export const workoutTemplates = pgTable(
  "workout_templates",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    exercises: jsonb("exercises").notNull(),
    /** Modelo padrão do sistema (seed) — pode ser duplicado/editado por aluno */
    isPreset: boolean("is_preset").notNull().default(false),
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("workout_templates_tenant_idx").on(t.tenantId),
    index("workout_templates_tenant_active_idx").on(t.tenantId, t.active),
  ],
);

/** Treino atribuído ao aluno (cópia de modelo ou personalizado). */
export const studentWorkouts = pgTable(
  "student_workouts",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    templateId: uuid("template_id").references(() => workoutTemplates.id, {
      onDelete: "set null",
    }),
    name: varchar("name", { length: 255 }).notNull(),
    exercises: jsonb("exercises").notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("student_workouts_tenant_student_idx").on(t.tenantId, t.studentId),
    index("student_workouts_student_idx").on(t.studentId),
  ],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    actorUserId: uuid("actor_user_id").references(() => tenantUsers.id, {
      onDelete: "set null",
    }),
    action: varchar("action", { length: 96 }).notNull(),
    entity: varchar("entity", { length: 64 }).notNull(),
    entityId: varchar("entity_id", { length: 64 }),
    payload: jsonb("payload"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("audit_logs_tenant_created_idx").on(t.tenantId, t.createdAt),
  ],
);

/** Catálogo da loja da academia (suplementos, bebidas, acessórios…). */
export const products = pgTable(
  "products",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    sku: varchar("sku", { length: 64 }),
    category: varchar("category", { length: 64 }),
    priceCents: integer("price_cents").notNull(),
    costCents: integer("cost_cents"),
    quantityOnHand: integer("quantity_on_hand").notNull().default(0),
    lowStockThreshold: integer("low_stock_threshold").notNull().default(5),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("products_tenant_idx").on(t.tenantId),
    index("products_tenant_active_idx").on(t.tenantId, t.active),
    uniqueIndex("products_tenant_sku")
      .on(t.tenantId, t.sku)
      .where(sql`${t.sku} IS NOT NULL`),
    check("products_quantity_nonnegative", sql`${t.quantityOnHand} >= 0`),
    check("products_price_nonnegative", sql`${t.priceCents} >= 0`),
    check(
      "products_low_stock_nonnegative",
      sql`${t.lowStockThreshold} >= 0`,
    ),
  ],
);

/** Venda no balcão (loja da academia). */
export const sales = pgTable(
  "sales",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    studentId: uuid("student_id").references(() => students.id, {
      onDelete: "set null",
    }),
    actorUserId: uuid("actor_user_id").references(() => tenantUsers.id, {
      onDelete: "set null",
    }),
    paymentMethod: varchar("payment_method", { length: 32 }).notNull(),
    totalCents: integer("total_cents").notNull(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("sales_tenant_created_idx").on(t.tenantId, t.createdAt),
    index("sales_tenant_student_idx").on(t.tenantId, t.studentId),
    check("sales_total_nonnegative", sql`${t.totalCents} >= 0`),
  ],
);

export const saleItems = pgTable(
  "sale_items",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    saleId: uuid("sale_id")
      .notNull()
      .references(() => sales.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    productName: varchar("product_name", { length: 255 }).notNull(),
    quantity: integer("quantity").notNull(),
    unitPriceCents: integer("unit_price_cents").notNull(),
    totalCents: integer("total_cents").notNull(),
  },
  (t) => [
    index("sale_items_sale_idx").on(t.saleId),
    index("sale_items_tenant_idx").on(t.tenantId),
    check("sale_items_quantity_positive", sql`${t.quantity} > 0`),
    check("sale_items_price_nonnegative", sql`${t.unitPriceCents} >= 0`),
  ],
);

/** Histórico de entrada, saída, ajuste e venda. */
export const stockMovements = pgTable(
  "stock_movements",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    type: stockMovementTypeEnum("type").notNull(),
    quantity: integer("quantity").notNull(),
    resultingQuantity: integer("resulting_quantity").notNull(),
    reason: varchar("reason", { length: 255 }),
    actorUserId: uuid("actor_user_id").references(() => tenantUsers.id, {
      onDelete: "set null",
    }),
    saleId: uuid("sale_id").references(() => sales.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("stock_movements_tenant_created_idx").on(t.tenantId, t.createdAt),
    index("stock_movements_tenant_product_idx").on(t.tenantId, t.productId),
    check("stock_movements_quantity_positive", sql`${t.quantity} > 0`),
    check(
      "stock_movements_resulting_nonnegative",
      sql`${t.resultingQuantity} >= 0`,
    ),
  ],
);
