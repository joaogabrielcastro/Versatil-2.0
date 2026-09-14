-- Loja da academia: produtos, estoque, vendas no balcão.
CREATE TYPE "public"."stock_movement_type" AS ENUM('in', 'out', 'adjust', 'sale');--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "products" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "name" varchar(255) NOT NULL,
  "sku" varchar(64),
  "category" varchar(64),
  "price_cents" integer NOT NULL,
  "cost_cents" integer,
  "quantity_on_hand" integer DEFAULT 0 NOT NULL,
  "low_stock_threshold" integer DEFAULT 5 NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "products_quantity_nonnegative" CHECK ("quantity_on_hand" >= 0),
  CONSTRAINT "products_price_nonnegative" CHECK ("price_cents" >= 0),
  CONSTRAINT "products_low_stock_nonnegative" CHECK ("low_stock_threshold" >= 0)
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "sales" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "student_id" uuid,
  "actor_user_id" uuid,
  "payment_method" varchar(32) NOT NULL,
  "total_cents" integer NOT NULL,
  "note" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "sales_total_nonnegative" CHECK ("total_cents" >= 0)
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "sale_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "sale_id" uuid NOT NULL,
  "product_id" uuid NOT NULL,
  "product_name" varchar(255) NOT NULL,
  "quantity" integer NOT NULL,
  "unit_price_cents" integer NOT NULL,
  "total_cents" integer NOT NULL,
  CONSTRAINT "sale_items_quantity_positive" CHECK ("quantity" > 0),
  CONSTRAINT "sale_items_price_nonnegative" CHECK ("unit_price_cents" >= 0)
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "stock_movements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "product_id" uuid NOT NULL,
  "type" "stock_movement_type" NOT NULL,
  "quantity" integer NOT NULL,
  "resulting_quantity" integer NOT NULL,
  "reason" varchar(255),
  "actor_user_id" uuid,
  "sale_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "stock_movements_quantity_positive" CHECK ("quantity" > 0),
  CONSTRAINT "stock_movements_resulting_nonnegative" CHECK ("resulting_quantity" >= 0)
);--> statement-breakpoint

ALTER TABLE "products" ADD CONSTRAINT "products_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_actor_user_id_tenant_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "tenant_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_actor_user_id_tenant_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "tenant_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "products_tenant_idx" ON "products" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "products_tenant_active_idx" ON "products" USING btree ("tenant_id","active");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "products_tenant_sku" ON "products" ("tenant_id","sku") WHERE "sku" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sales_tenant_created_idx" ON "sales" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sales_tenant_student_idx" ON "sales" USING btree ("tenant_id","student_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sale_items_sale_idx" ON "sale_items" USING btree ("sale_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sale_items_tenant_idx" ON "sale_items" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stock_movements_tenant_created_idx" ON "stock_movements" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stock_movements_tenant_product_idx" ON "stock_movements" USING btree ("tenant_id","product_id");--> statement-breakpoint

ALTER TABLE "products" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "products_select" ON "products" FOR SELECT USING ("app"."tenant_row_ok"("tenant_id"));--> statement-breakpoint
CREATE POLICY "products_insert" ON "products" FOR INSERT WITH CHECK ("app"."tenant_row_ok"("tenant_id"));--> statement-breakpoint
CREATE POLICY "products_update" ON "products" FOR UPDATE USING ("app"."tenant_row_ok"("tenant_id")) WITH CHECK ("app"."tenant_row_ok"("tenant_id"));--> statement-breakpoint
CREATE POLICY "products_delete" ON "products" FOR DELETE USING ("app"."tenant_row_ok"("tenant_id"));--> statement-breakpoint

ALTER TABLE "sales" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "sales_select" ON "sales" FOR SELECT USING ("app"."tenant_row_ok"("tenant_id"));--> statement-breakpoint
CREATE POLICY "sales_insert" ON "sales" FOR INSERT WITH CHECK ("app"."tenant_row_ok"("tenant_id"));--> statement-breakpoint
CREATE POLICY "sales_update" ON "sales" FOR UPDATE USING ("app"."tenant_row_ok"("tenant_id")) WITH CHECK ("app"."tenant_row_ok"("tenant_id"));--> statement-breakpoint
CREATE POLICY "sales_delete" ON "sales" FOR DELETE USING ("app"."tenant_row_ok"("tenant_id"));--> statement-breakpoint

ALTER TABLE "sale_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "sale_items_select" ON "sale_items" FOR SELECT USING ("app"."tenant_row_ok"("tenant_id"));--> statement-breakpoint
CREATE POLICY "sale_items_insert" ON "sale_items" FOR INSERT WITH CHECK ("app"."tenant_row_ok"("tenant_id"));--> statement-breakpoint
CREATE POLICY "sale_items_update" ON "sale_items" FOR UPDATE USING ("app"."tenant_row_ok"("tenant_id")) WITH CHECK ("app"."tenant_row_ok"("tenant_id"));--> statement-breakpoint
CREATE POLICY "sale_items_delete" ON "sale_items" FOR DELETE USING ("app"."tenant_row_ok"("tenant_id"));--> statement-breakpoint

ALTER TABLE "stock_movements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "stock_movements_select" ON "stock_movements" FOR SELECT USING ("app"."tenant_row_ok"("tenant_id"));--> statement-breakpoint
CREATE POLICY "stock_movements_insert" ON "stock_movements" FOR INSERT WITH CHECK ("app"."tenant_row_ok"("tenant_id"));--> statement-breakpoint
CREATE POLICY "stock_movements_update" ON "stock_movements" FOR UPDATE USING ("app"."tenant_row_ok"("tenant_id")) WITH CHECK ("app"."tenant_row_ok"("tenant_id"));--> statement-breakpoint
CREATE POLICY "stock_movements_delete" ON "stock_movements" FOR DELETE USING ("app"."tenant_row_ok"("tenant_id"));
