-- Revisão de aulas avulsas já lançadas. Só consulta. Não cria autorização
-- e não inventa a data de validade. Uma fatura antiga pode não ter data
-- nem beneficiário suficientes para virar autorização.
-- A migration 0023 e scripts/review-unclassified-fees.sql permanecem como estão.
--
-- Entram só cobranças ligadas ao código taxa-aula-avulsa-crossfit pela chave
-- fee:{plano}:{solicitação}, ou autorizações novas com chave drop-in:.
-- Valor parecido, sem esse vínculo, não entra na lista.

SELECT
  inv.tenant_id,
  inv.id AS invoice_id,
  inv.student_id,
  stu.full_name,
  inv.amount_cents,
  inv.status,
  inv.due_at,
  inv.paid_at,
  inv.idempotency_key,
  plan.code AS plan_code,
  plan.name AS plan_name
FROM invoices AS inv
LEFT JOIN students AS stu
  ON stu.id = inv.student_id
 AND stu.tenant_id = inv.tenant_id
LEFT JOIN plans AS plan
  ON plan.tenant_id = inv.tenant_id
 AND plan.id::text = split_part(inv.idempotency_key, ':', 2)
 AND inv.idempotency_key LIKE 'fee:%'
WHERE (
    plan.code = 'taxa-aula-avulsa-crossfit'
    OR inv.idempotency_key LIKE 'drop-in:%'
  )
ORDER BY inv.tenant_id, inv.due_at;
