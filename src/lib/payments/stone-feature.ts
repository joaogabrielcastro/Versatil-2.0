/**
 * Integração Stone (maquininha) ligada só com STONE_ENABLED=true.
 *
 * Desligada (padrão): não envia cobrança ao POS, não agenda envio automático
 * e não aceita credenciais novas. Registro de pagamento no balcão continua.
 * Conciliação e webhook seguem ativos para confirmar cobranças já enviadas.
 */
export function isStoneEnabled(): boolean {
  return process.env.STONE_ENABLED === "true";
}

export const STONE_DISABLED_MESSAGE =
  "Integração com a maquininha Stone desativada. Registre o pagamento no balcão.";
