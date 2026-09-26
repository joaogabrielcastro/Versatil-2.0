-- Separa dívida de serviço do impedimento de acesso.
-- block e none são copiados para a fatura no lançamento.
-- Faturas já gravadas ficam sem classificação e continuam podendo bloquear.
ALTER TABLE "plans" ADD COLUMN "access_effect" varchar(16);
ALTER TABLE "invoices" ADD COLUMN "access_effect" varchar(16);

ALTER TABLE "plans" ADD CONSTRAINT "plans_access_effect_check"
  CHECK ("access_effect" IS NULL OR "access_effect" IN ('block', 'none'));
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_access_effect_check"
  CHECK ("access_effect" IS NULL OR "access_effect" IN ('block', 'none'));

UPDATE "plans"
SET "access_effect" = 'block'
WHERE "kind" = 'fee'
  AND "access_effect" IS NULL
  AND "code" IN ('taxa-matricula-academia', 'taxa-matricula-crossfit');

UPDATE "plans"
SET "access_effect" = 'none'
WHERE "kind" = 'fee'
  AND "access_effect" IS NULL
  AND "code" IN (
    'taxa-nutricionista',
    'taxa-avaliacao-fisica',
    'taxa-aula-avulsa-crossfit'
  );
