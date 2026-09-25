import { NextResponse } from "next/server";
import { AUTH_COOKIE_NAME } from "@/lib/auth/constants";
import { getSession, revokeSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function POST() {
  const session = await getSession();
  if (session) {
    await revokeSession(session);
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 0,
  });
  return res;
}
