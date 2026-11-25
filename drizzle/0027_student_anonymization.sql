-- LGPD: marca o aluno anonimizado (dados pessoais removidos, financeiro mantido).
-- Só adiciona coluna anulável; não altera linhas existentes.
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "anonymized_at" timestamp with time zone;
