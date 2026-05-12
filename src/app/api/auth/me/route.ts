import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api/json";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return jsonError(401, "Não autenticado.");
  }
  return NextResponse.json({
    session: {
      sub: session.sub,
      typ: session.typ,
      tid: session.tid,
      role: session.role,
    },
  });
}
