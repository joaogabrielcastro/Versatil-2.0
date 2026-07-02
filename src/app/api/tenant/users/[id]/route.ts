import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { logAudit } from "@/lib/audit/log";
import { jsonError } from "@/lib/api/json";
import { hashPassword } from "@/lib/auth/password";
import {
  isSessionError,
  requireTenantAdmin,
} from "@/lib/auth/guards";
import { tenantUsers } from "@/lib/db/schema";
import { withTenantTransaction } from "@/lib/db/with-tenant";
import {
  countTenantAdmins,
  getTenantUser,
} from "@/lib/services/tenant-users";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  role: z.enum(["tenant_admin", "tenant_user"]).optional(),
  password: z.string().min(8).max(128).optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const session = await requireTenantAdmin();
  if (isSessionError(session)) return session;
  const tenantId = session.tid;

  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) {
    return jsonError(400, "ID inválido.");
  }

  let body: z.infer<typeof patchSchema>;
  try {
    body = patchSchema.parse(await request.json());
  } catch {
    return jsonError(400, "Payload inválido.");
  }

  if (!body.role && !body.password) {
    return jsonError(400, "Informe a atribuição ou uma nova senha.");
  }

  const result = await withTenantTransaction(tenantId, async (tx) => {
    const existing = await getTenantUser(tx, tenantId, id);
    if (!existing) return { error: "not_found" as const };

    if (
      body.role &&
      body.role !== "tenant_admin" &&
      existing.role === "tenant_admin"
    ) {
      const admins = await countTenantAdmins(tx, tenantId);
      if (admins <= 1 && existing.id === session.sub) {
        return { error: "last_admin" as const };
      }
    }

    const updates: Partial<{
      role: "tenant_admin" | "tenant_user";
      passwordHash: string;
    }> = {};
    if (body.role) updates.role = body.role;
    if (body.password) updates.passwordHash = await hashPassword(body.password);

    const [row] = await tx
      .update(tenantUsers)
      .set(updates)
      .where(and(eq(tenantUsers.tenantId, tenantId), eq(tenantUsers.id, id)))
      .returning({
        id: tenantUsers.id,
        email: tenantUsers.email,
        role: tenantUsers.role,
        createdAt: tenantUsers.createdAt,
      });

    return { user: row! };
  }) as
    | { user: { id: string; email: string; role: string; createdAt: Date } }
    | { error: "not_found" }
    | { error: "last_admin" };

  if ("error" in result) {
    if (result.error === "not_found") {
      return jsonError(404, "Usuário não encontrado.");
    }
    return jsonError(
      400,
      "Não é possível remover o único administrador da academia.",
    );
  }

  await logAudit({
    tenantId,
    actorUserId: session.sub,
    action: "tenant_user.updated",
    entity: "tenant_user",
    entityId: id,
    payload: {
      role: body.role,
      passwordChanged: Boolean(body.password),
    },
  });

  return NextResponse.json({ user: result.user });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const session = await requireTenantAdmin();
  if (isSessionError(session)) return session;
  const tenantId = session.tid;

  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) {
    return jsonError(400, "ID inválido.");
  }

  if (id === session.sub) {
    return jsonError(400, "Você não pode remover o seu próprio usuário.");
  }

  const result = (await withTenantTransaction(tenantId, async (tx) => {
    const existing = await getTenantUser(tx, tenantId, id);
    if (!existing) return { error: "not_found" as const };

    if (existing.role === "tenant_admin") {
      const admins = await countTenantAdmins(tx, tenantId);
      if (admins <= 1) {
        return { error: "last_admin" as const };
      }
    }

    await tx
      .delete(tenantUsers)
      .where(and(eq(tenantUsers.tenantId, tenantId), eq(tenantUsers.id, id)));

    return { email: existing.email };
  })) as { email: string } | { error: "not_found" } | { error: "last_admin" };

  if ("error" in result) {
    if (result.error === "not_found") {
      return jsonError(404, "Usuário não encontrado.");
    }
    return jsonError(400, "A academia precisa de pelo menos um administrador.");
  }

  await logAudit({
    tenantId,
    actorUserId: session.sub,
    action: "tenant_user.deleted",
    entity: "tenant_user",
    entityId: id,
    payload: { email: result.email },
  });

  return NextResponse.json({ ok: true });
}
