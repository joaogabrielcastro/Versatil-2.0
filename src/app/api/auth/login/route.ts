import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError } from "@/lib/api/json";
import { AUTH_COOKIE_NAME } from "@/lib/auth/constants";
import { signSessionToken } from "@/lib/auth/jwt";
import { verifyPassword } from "@/lib/auth/password";
import { withBypassRlsTransaction } from "@/lib/db/with-tenant";
import { tenantUsers } from "@/lib/db/schema";
import { getEnv } from "@/lib/env";
import { getTenantIdBySlug } from "@/lib/tenant/resolve";
import { logAudit } from "@/lib/audit/log";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  tenantSlug: z.string().min(1).max(64).optional(),
});

export async function POST(request: Request) {
  const h = await headers();
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    h.get("x-real-ip") ??
    "unknown";

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return jsonError(400, "Payload inválido.");
  }

  const slug = body.tenantSlug ?? h.get("x-tenant-slug");
  if (!slug) {
    return jsonError(
      400,
      "Informe tenantSlug no corpo ou acesse pelo subdomínio da academia.",
    );
  }

  const tenantId = await getTenantIdBySlug(slug);
  if (!tenantId) {
    return jsonError(404, "Academia não encontrada.");
  }

  const { checkLoginRateLimit } = await import("@/lib/auth/login-rate-limit");
  const rl = checkLoginRateLimit(`${ip}:${slug}:${body.email.toLowerCase()}`);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Muitas tentativas. Tente novamente em instantes." },
      {
        status: 429,
        headers: { "Retry-After": String(rl.retryAfterSec) },
      },
    );
  }

  const user = await withBypassRlsTransaction(async (tx) => {
    const [row] = await tx
      .select({
        id: tenantUsers.id,
        passwordHash: tenantUsers.passwordHash,
        role: tenantUsers.role,
      })
      .from(tenantUsers)
      .where(
        and(
          eq(tenantUsers.tenantId, tenantId),
          eq(tenantUsers.email, body.email.toLowerCase()),
        ),
      )
      .limit(1);
    return row ?? null;
  });

  if (
    !user ||
    !(await verifyPassword(body.password, user.passwordHash))
  ) {
    void logAudit({
      tenantId,
      actorUserId: null,
      action: "auth.login_failed",
      entity: "tenant_user",
      payload: { email: body.email.toLowerCase() },
    }).catch(() => {});
    return jsonError(401, "Credenciais inválidas.");
  }

  void logAudit({
    tenantId,
    actorUserId: user.id,
    action: "auth.login_success",
    entity: "tenant_user",
    entityId: user.id,
  }).catch(() => {});

  const token = await signSessionToken(
    {
      sub: user.id,
      typ: "tenant",
      tid: tenantId,
      role: user.role,
    },
    getEnv().JWT_SECRET,
  );

  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}
