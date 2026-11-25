-- Revisão (somente leitura): alunos com mais de uma matrícula vigente na
-- mesma modalidade (categoria do plano; sem categoria = mesmo plano).
-- Cada linha extra gera fatura própria todo ciclo (cobrança em dobro).
-- Não altera dados. Corrija caso a caso pelo balcão (cancelar a duplicada)
-- depois de conferir as faturas já pagas.
--
--   psql "$BACKUP_DATABASE_URL" -f scripts/review-duplicate-subscriptions.sql

SELECT
  t.slug AS academia,
  st.full_name AS aluno,
  COALESCE(p.category, p.name) AS modalidade,
  count(*) AS matriculas_vigentes,
  array_agg(s.id ORDER BY s.created_at) AS subscription_ids,
  array_agg(p.name ORDER BY s.created_at) AS planos
FROM student_subscriptions s
JOIN plans p ON p.id = s.plan_id
JOIN students st ON st.id = s.student_id
JOIN tenants t ON t.id = s.tenant_id
WHERE s.active
  AND (s.ends_at IS NULL OR s.ends_at >= now())
  AND (s.cancel_effective_at IS NULL OR s.cancel_effective_at > now())
GROUP BY t.slug, st.full_name, s.student_id, COALESCE(p.category, p.id::text), COALESCE(p.category, p.name)
HAVING count(*) > 1
ORDER BY t.slug, st.full_name;
