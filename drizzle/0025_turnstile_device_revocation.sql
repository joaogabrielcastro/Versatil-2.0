-- Revogação de dispositivo de catraca sem apagar o histórico de acessos.
-- Só adiciona coluna anulável; não altera linhas existentes.
ALTER TABLE "turnstile_devices" ADD COLUMN IF NOT EXISTS "revoked_at" timestamp with time zone;
