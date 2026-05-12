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

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  tenantSlug: z.string().min(1).max(64).optional(),
});

export async function POST(request: Request) {
  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return jsonError(400, "Payload inválido.");
  }

  const h = await headers();
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
    return jsonError(401, "Credenciais inválidas.");
  }

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
