export const STUDENT_STATUS_LABELS: Record<string, string> = {
  active: "Ativo",
  delinquent: "Inadimplente",
  inactive: "Inativo",
};

export const STUDENT_STATUS_STYLES: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-800 border-emerald-200",
  delinquent: "bg-red-100 text-red-800 border-red-200",
  inactive: "bg-zinc-100 text-zinc-600 border-zinc-200",
};

export const INVOICE_STATUS_LABELS: Record<string, string> = {
  draft: "Rascunho",
  open: "Em aberto",
  paid: "Paga",
  void: "Cancelada",
  uncollectible: "Incobrável",
};

export const ROLE_LABELS: Record<string, string> = {
  tenant_admin: "Administrador",
  tenant_user: "Recepcionista",
  super_admin: "Super admin",
};

export const TIMELINE_EVENT_LABELS: Record<string, string> = {
  gateway_charge: "Cobrança online",
  gateway_failure: "Falha no pagamento",
  manual_payment: "Pagamento no balcão",
  note: "Observação",
  webhook_received: "Confirmação automática",
};

export function studentStatusLabel(status: string): string {
  return STUDENT_STATUS_LABELS[status] ?? status;
}

export function invoiceStatusLabel(status: string): string {
  return INVOICE_STATUS_LABELS[status] ?? status;
}

export function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role;
}

export function timelineEventLabel(type: string): string {
  return TIMELINE_EVENT_LABELS[type] ?? type;
}

/** Formata CPF 11 dígitos → 000.000.000-00 */
export function formatCpf(cpf: string): string {
  const d = cpf.replace(/\D/g, "");
  if (d.length !== 11) return cpf;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}
