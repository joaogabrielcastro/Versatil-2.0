-- Faturas antigas de aula avulsa CrossFit. Só consulta.
-- Não cria autorização e não inventa a data de uso: due_at é vencimento
-- da cobrança, não a data em que a pessoa podia entrar.
-- A migration 0023 permanece; esta lista não altera access_effect.

SELECT
  inv.tenant_id,
  inv.id AS invoice_id,
  inv.student_id,
  inv.amount_cents,
  inv.status,
  inv.due_at,
  inv.paid_at,
  inv.access_effect,
  inv.idempotency_key,
  plan.code AS plan_code,
  plan.name AS plan_name
FROM invoices AS inv
LEFT JOIN plans AS plan
  ON plan.tenant_id = inv.tenant_id
 AND plan.id::text = split_part(inv.idempotency_key, ':', 2)
 AND inv.idempotency_key LIKE 'fee:%'
WHERE inv.purpose = 'fee'
  AND (
    plan.code = 'taxa-aula-avulsa-crossfit'
    OR (
      plan.code IS NULL
      AND inv.idempotency_key LIKE 'fee:%'
      AND EXISTS (
        SELECT 1
        FROM invoice_timeline_events AS ev
        WHERE ev.tenant_id = inv.tenant_id
          AND ev.invoice_id = inv.id
          AND ev.payload ->> 'message' ILIKE '%aula avulsa%'
      )
    )
  )
ORDER BY inv.tenant_id, inv.created_at;
