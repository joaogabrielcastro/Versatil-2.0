-- Renovações gravadas no mesmo instante do fim inclusivo do contrato
-- sobrepunham esse instante e faziam o primeiro vencimento cair no último
-- dia já coberto. O início passa a ser o instante seguinte. Não cria fatura
-- e não altera preço, intervalo nem o contrato vigente.
UPDATE "subscription_terms" AS term
SET
  "starts_at" = sub."ends_at" + interval '1 millisecond',
  "valid_from" = CASE
    WHEN term."valid_from" = term."starts_at" THEN sub."ends_at" + interval '1 millisecond'
    ELSE term."valid_from"
  END
FROM "student_subscriptions" AS sub
WHERE term."subscription_id" = sub."id"
  AND term."source" = 'renewal'
  AND sub."ends_at" IS NOT NULL
  AND term."starts_at" = sub."ends_at"
  AND term."ends_at" IS NOT NULL
  AND term."ends_at" > sub."ends_at" + interval '1 millisecond';
