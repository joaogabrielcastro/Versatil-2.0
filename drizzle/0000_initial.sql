CREATE TYPE "public"."billing_interval" AS ENUM('monthly', 'yearly');--> statement-breakpoint
CREATE TYPE "public"."import_job_status" AS ENUM('queued', 'processing', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('draft', 'open', 'paid', 'void', 'uncollectible');--> statement-breakpoint
CREATE TYPE "public"."payment_gateway" AS ENUM('stripe', 'asaas');--> statement-breakpoint
CREATE TYPE "public"."settlement_source" AS ENUM('automatic_gateway', 'manual_reception');--> statement-breakpoint
CREATE TYPE "public"."student_status" AS ENUM('active', 'delinquent', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."invoice_timeline_event_type" AS ENUM('gateway_charge', 'gateway_failure', 'manual_payment', 'note', 'webhook_received');--> statement-breakpoint
CREATE TYPE "public"."tenant_user_role" AS ENUM('tenant_admin', 'tenant_user');--> statement-breakpoint
CREATE TABLE "access_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"student_id" uuid,
	"device_id" uuid,
	"allowed" boolean NOT NULL,
	"reason" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"created_by_user_id" uuid,
	"status" "import_job_status" DEFAULT 'queued' NOT NULL,
	"file_key" text NOT NULL,
	"column_mapping" jsonb NOT NULL,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "invoice_timeline_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"type" "invoice_timeline_event_type" NOT NULL,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'BRL' NOT NULL,
	"status" "invoice_status" DEFAULT 'open' NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"paid_at" timestamp with time zone,
	"settlement_source" "settlement_source",
	"external_id" varchar(255),
	"idempotency_key" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"price_cents" integer NOT NULL,
	"billing_interval" "billing_interval" DEFAULT 'monthly' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_admins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_admins_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "student_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "students" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"full_name" varchar(255) NOT NULL,
	"cpf" varchar(14) NOT NULL,
	"email" varchar(255),
	"whatsapp" varchar(32),
	"birth_date" timestamp,
	"facial_vector_ref" text,
	"status" "student_status" DEFAULT 'inactive' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_payment_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"gateway" "payment_gateway" NOT NULL,
	"encrypted_credentials" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_payment_settings_tenant_id_unique" UNIQUE("tenant_id")
);
--> statement-breakpoint
CREATE TABLE "tenant_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" text NOT NULL,
	"role" "tenant_user_role" DEFAULT 'tenant_user' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenants_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "turnstile_devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"token_hash" text NOT NULL,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_dedupe" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"provider" varchar(32) NOT NULL,
	"event_id" varchar(255) NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "access_events" ADD CONSTRAINT "access_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_events" ADD CONSTRAINT "access_events_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_events" ADD CONSTRAINT "access_events_device_id_turnstile_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."turnstile_devices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_created_by_user_id_tenant_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."tenant_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_timeline_events" ADD CONSTRAINT "invoice_timeline_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_timeline_events" ADD CONSTRAINT "invoice_timeline_events_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_subscriptions" ADD CONSTRAINT "student_subscriptions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_subscriptions" ADD CONSTRAINT "student_subscriptions_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_subscriptions" ADD CONSTRAINT "student_subscriptions_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_payment_settings" ADD CONSTRAINT "tenant_payment_settings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_users" ADD CONSTRAINT "tenant_users_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turnstile_devices" ADD CONSTRAINT "turnstile_devices_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_dedupe" ADD CONSTRAINT "webhook_dedupe_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "access_events_tenant_created_idx" ON "access_events" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "import_jobs_tenant_idx" ON "import_jobs" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "invoice_timeline_tenant_invoice_idx" ON "invoice_timeline_events" USING btree ("tenant_id","invoice_id");--> statement-breakpoint
CREATE INDEX "invoices_tenant_student_idx" ON "invoices" USING btree ("tenant_id","student_id");--> statement-breakpoint
CREATE INDEX "invoices_tenant_due_idx" ON "invoices" USING btree ("tenant_id","due_at");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_tenant_idempotency" ON "invoices" USING btree ("tenant_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "plans_tenant_idx" ON "plans" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "student_subscriptions_tenant_idx" ON "student_subscriptions" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "student_subscriptions_student_idx" ON "student_subscriptions" USING btree ("student_id");--> statement-breakpoint
CREATE UNIQUE INDEX "students_tenant_cpf" ON "students" USING btree ("tenant_id","cpf");--> statement-breakpoint
CREATE INDEX "students_tenant_email_idx" ON "students" USING btree ("tenant_id","email");--> statement-breakpoint
CREATE INDEX "students_tenant_idx" ON "students" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "tenant_payment_settings_tenant_idx" ON "tenant_payment_settings" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_users_tenant_email" ON "tenant_users" USING btree ("tenant_id","email");--> statement-breakpoint
CREATE INDEX "tenant_users_tenant_idx" ON "tenant_users" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "turnstile_devices_tenant_idx" ON "turnstile_devices" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "turnstile_devices_token_hash" ON "turnstile_devices" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_dedupe_tenant_provider_event" ON "webhook_dedupe" USING btree ("tenant_id","provider","event_id");