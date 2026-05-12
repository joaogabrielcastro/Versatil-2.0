import "server-only";
import { cookies } from "next/headers";
import { getEnv } from "@/lib/env";
import { AUTH_COOKIE_NAME } from "./constants";
import { verifySessionToken } from "./jwt";
import type { SessionPayload } from "./types";

export async function getSession(): Promise<SessionPayload | null> {
  const jar = await cookies();
  const token = jar.get(AUTH_COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    return await verifySessionToken(token, getEnv().JWT_SECRET);
  } catch {
    return null;
  }
}
