-- Índices para consultas frequentes em escala

CREATE INDEX IF NOT EXISTS students_tenant_status_idx
  ON students (tenant_id, status);

CREATE INDEX IF NOT EXISTS invoices_tenant_status_idx
  ON invoices (tenant_id, status);

CREATE INDEX IF NOT EXISTS invoices_tenant_status_due_idx
  ON invoices (tenant_id, status, due_at);

CREATE INDEX IF NOT EXISTS invoices_tenant_paid_at_idx
  ON invoices (tenant_id, paid_at)
  WHERE status = 'paid';

CREATE INDEX IF NOT EXISTS student_subscriptions_tenant_active_idx
  ON student_subscriptions (tenant_id, active);
