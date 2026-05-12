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
  "yearly",
]);

export const paymentGatewayEnum = pgEnum("payment_gateway", [
  "stripe",
  "asaas",
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

export const platformAdmins = pgTable("platform_admins", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
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
    priceCents: integer("price_cents").notNull(),
    billingInterval: billingIntervalEnum("billing_interval")
      .notNull()
      .default("monthly"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("plans_tenant_idx").on(t.tenantId)],
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
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("student_subscriptions_tenant_idx").on(t.tenantId),
    index("student_subscriptions_student_idx").on(t.studentId),
  ],
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
    processedAt: timestamp("processed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("webhook_dedupe_tenant_provider_event").on(
      t.tenantId,
      t.provider,
      t.eventId,
    ),
  ],
);
