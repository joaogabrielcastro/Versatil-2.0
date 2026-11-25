import { cookies } from "next/headers";
import { eq, sql } from "drizzle-orm";
import { getEnv } from "@/lib/env";
import { platformAdmins, tenantUsers } from "@/lib/db/schema";
import { withBypassRlsTransaction, withTenantTransaction } from "@/lib/db/with-tenant";
import { AUTH_COOKIE_NAME } from "./constants";
import { verifySessionToken } from "./jwt";
import type { SessionPayload } from "./types";

type StoredSession = {
  sv: number;
  role: SessionPayload["role"];
};

/** Versão e perfil atuais no banco. O perfil do token não é confiável após mudança. */
async function storedSession(session: SessionPayload): Promise<StoredSession | null> {
  if (session.typ === "tenant" && session.tid) {
    return withTenantTransaction(session.tid, async (tx) => {
      const [row] = await tx
        .select({ sv: tenantUsers.sessionVersion, role: tenantUsers.role })
        .from(tenantUsers)
        .where(eq(tenantUsers.id, session.sub))
        .limit(1);
      return row ?? null;
    });
  }
  if (session.typ === "platform") {
    return withBypassRlsTransaction(async (tx) => {
      const [row] = await tx
        .select({ sv: platformAdmins.sessionVersion })
        .from(platformAdmins)
        .where(eq(platformAdmins.id, session.sub))
        .limit(1);
      return row ? { sv: row.sv, role: "super_admin" as const } : null;
    });
  }
  return null;
}

export async function revokeSession(session: SessionPayload): Promise<void> {
  if (session.typ === "tenant" && session.tid) {
    await withTenantTransaction(session.tid, async (tx) => {
      await tx
        .update(tenantUsers)
        .set({ sessionVersion: sql`${tenantUsers.sessionVersion} + 1` })
        .where(eq(tenantUsers.id, session.sub));
    });
    return;
  }
  if (session.typ === "platform") {
    await withBypassRlsTransaction(async (tx) => {
      await tx
        .update(platformAdmins)
        .set({ sessionVersion: sql`${platformAdmins.sessionVersion} + 1` })
        .where(eq(platformAdmins.id, session.sub));
    });
  }
}

export async function getSession(): Promise<SessionPayload | null> {
  const jar = await cookies();
  const token = jar.get(AUTH_COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const session = await verifySessionToken(token, getEnv().JWT_SECRET);
    const current = await storedSession(session);
    if (current === null || current.sv !== session.sv) return null;
    return { ...session, role: current.role };
  } catch {
    return null;
  }
}
