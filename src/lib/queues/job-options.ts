export const WEBHOOK_JOB_OPTS = {
  attempts: 8,
  backoff: { type: "exponential" as const, delay: 2_000 },
  removeOnComplete: 200,
  removeOnFail: 200,
};

export const DEFAULT_JOB_OPTS = {
  attempts: 5,
  backoff: { type: "exponential" as const, delay: 3_000 },
  removeOnComplete: 100,
  removeOnFail: 100,
};

/**
 * Importação carrega linhas do CSV (nome, CPF, e-mail, WhatsApp) no Redis.
 * O resultado fica em import_jobs; o payload some ao concluir e, se falhar,
 * após 24h (tempo para diagnóstico). LGPD: minimização e retenção limitada.
 */
export const IMPORT_JOB_OPTS = {
  removeOnComplete: true,
  removeOnFail: { age: 24 * 60 * 60 },
};
