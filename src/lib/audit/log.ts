import { auditLogs } from "@/lib/db/schema";
import { withTenantTransaction } from "@/lib/db/with-tenant";

export async function logAudit(input: {
  tenantId: string;
  actorUserId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  payload?: unknown;
}): Promise<void> {
  await withTenantTransaction(input.tenantId, async (tx) => {
    await tx.insert(auditLogs).values({
      tenantId: input.tenantId,
      actorUserId: input.actorUserId ?? null,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId ?? null,
      payload: input.payload ?? null,
    });
  });
}
