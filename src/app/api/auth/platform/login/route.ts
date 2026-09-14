import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError } from "@/lib/api/json";
import { AUTH_COOKIE_NAME } from "@/lib/auth/constants";
import { signSessionToken } from "@/lib/auth/jwt";
import { verifyPassword } from "@/lib/auth/password";
import { withBypassRlsTransaction } from "@/lib/db/with-tenant";
import { platformAdmins } from "@/lib/db/schema";
import { getEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
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

  const { checkLoginRateLimit } = await import("@/lib/auth/login-rate-limit");
  const rl = await checkLoginRateLimit(
    `platform:${ip}:${body.email.toLowerCase()}`,
  );
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Muitas tentativas. Tente novamente em instantes." },
      {
        status: 429,
        headers: { "Retry-After": String(rl.retryAfterSec) },
      },
    );
  }

  const admin = await withBypassRlsTransaction(async (tx) => {
    const [row] = await tx
      .select({
        id: platformAdmins.id,
        passwordHash: platformAdmins.passwordHash,
      })
      .from(platformAdmins)
      .where(eq(platformAdmins.email, body.email.toLowerCase()))
      .limit(1);
    return row ?? null;
  });

  if (
    !admin ||
    !(await verifyPassword(body.password, admin.passwordHash))
  ) {
    return jsonError(401, "Credenciais inválidas.");
  }

  const token = await signSessionToken(
    {
      sub: admin.id,
      typ: "platform",
      tid: null,
      role: "super_admin",
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
