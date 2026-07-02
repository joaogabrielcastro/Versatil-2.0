import { desc } from "drizzle-orm";
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

export const dynamic = "force-dynamic";

const roleSchema = z.enum(["tenant_admin", "tenant_user"]);

const createSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(128),
  role: roleSchema.default("tenant_user"),
});

export async function GET() {
  const session = await requireTenantAdmin();
  if (isSessionError(session)) return session;
  const tenantId = session.tid;

  const items = await withTenantTransaction(tenantId, async (tx) => {
    return tx
      .select({
        id: tenantUsers.id,
        email: tenantUsers.email,
        role: tenantUsers.role,
        createdAt: tenantUsers.createdAt,
      })
      .from(tenantUsers)
      .orderBy(desc(tenantUsers.createdAt));
  });

  return NextResponse.json({ items });
}

export async function POST(request: Request) {
  const session = await requireTenantAdmin();
  if (isSessionError(session)) return session;
  const tenantId = session.tid;

  let body: z.infer<typeof createSchema>;
  try {
    body = createSchema.parse(await request.json());
  } catch {
    return jsonError(400, "Payload inválido.");
  }

  const email = body.email.trim().toLowerCase();
  const passwordHash = await hashPassword(body.password);

  try {
    const [row] = await withTenantTransaction(tenantId, async (tx) => {
      const [u] = await tx
        .insert(tenantUsers)
        .values({
          tenantId,
          email,
          passwordHash,
          role: body.role,
        })
        .returning({
          id: tenantUsers.id,
          email: tenantUsers.email,
          role: tenantUsers.role,
          createdAt: tenantUsers.createdAt,
        });
      return [u];
    });

    await logAudit({
      tenantId,
      actorUserId: session.sub,
      action: "tenant_user.created",
      entity: "tenant_user",
      entityId: row!.id,
      payload: { email, role: body.role },
    });

    return NextResponse.json({ user: row }, { status: 201 });
  } catch (err: unknown) {
    const code =
      err && typeof err === "object" && "code" in err
        ? String((err as { code: string }).code)
        : "";
    if (code === "23505") {
      return jsonError(409, "Já existe um usuário com este e-mail nesta academia.");
    }
    throw err;
  }
}
