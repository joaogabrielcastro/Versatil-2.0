-- Revisão de taxas antigas. Só consulta. Não altera produção sozinho.
-- access_effect nulo em fatura de taxa mantém o bloqueio atual da catraca.
-- A sugestão abaixo usa o código atual do plano ligado pela chave
-- fee:{plano}:{solicitação}. Não grave esse valor sem conferir a cobrança.
--
-- Depois da conferência, uma linha por vez:
-- UPDATE invoices
-- SET access_effect = 'none'
-- WHERE id = '<id>'
--   AND tenant_id = '<academia>'
--   AND purpose = 'fee'
--   AND access_effect IS NULL;

SELECT
  inv.tenant_id,
  inv.id AS invoice_id,
  inv.student_id,
  inv.amount_cents,
  inv.status,
  inv.due_at,
  inv.idempotency_key,
  plan.code AS plan_code,
  plan.name AS plan_name,
  CASE
    WHEN plan.code IN ('taxa-matricula-academia', 'taxa-matricula-crossfit') THEN 'block'
    WHEN plan.code IN (
      'taxa-nutricionista',
      'taxa-avaliacao-fisica',
      'taxa-aula-avulsa-crossfit'
    ) THEN 'none'
    ELSE NULL
  END AS sugestao_nao_aplicada
FROM invoices AS inv
LEFT JOIN plans AS plan
  ON plan.tenant_id = inv.tenant_id
 AND plan.id::text = split_part(inv.idempotency_key, ':', 2)
 AND inv.idempotency_key LIKE 'fee:%'
WHERE inv.purpose = 'fee'
  AND inv.access_effect IS NULL
ORDER BY inv.tenant_id, inv.due_at;
