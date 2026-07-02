export type StudentComputedStatus = "active" | "delinquent" | "inactive";

/** Lógica pura de status do aluno (testável sem banco). */
export function computeStudentStatus(input: {
  hasBadInvoice: boolean;
  hasActivePlan: boolean;
}): StudentComputedStatus {
  if (input.hasBadInvoice) return "delinquent";
  if (input.hasActivePlan) return "active";
  return "inactive";
}

export function isSubscriptionActiveAt(
  startsAt: Date,
  endsAt: Date | null,
  now: Date,
): boolean {
  if (startsAt.getTime() > now.getTime()) return false;
  if (endsAt && endsAt.getTime() < now.getTime()) return false;
  return true;
}
