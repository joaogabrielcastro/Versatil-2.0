import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { JWT_AUDIENCE, JWT_ISSUER } from "./constants";
import { sessionPayloadSchema, type SessionPayload } from "./types";

function secretKey(secret: string) {
  return new TextEncoder().encode(secret);
}

export async function signSessionToken(
  payload: SessionPayload,
  secret: string,
): Promise<string> {
  const jwt = new SignJWT({
    typ: payload.typ,
    tid: payload.tid,
    role: payload.role,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setExpirationTime("7d");

  return jwt.sign(secretKey(secret));
}

function parsePayload(claims: JWTPayload): SessionPayload {
  const raw = {
    sub: typeof claims.sub === "string" ? claims.sub : "",
    typ: claims.typ,
    tid: claims.tid === undefined || claims.tid === null ? null : claims.tid,
    role: claims.role,
  };
  return sessionPayloadSchema.parse(raw);
}

export async function verifySessionToken(
  token: string,
  secret: string,
): Promise<SessionPayload> {
  const { payload } = await jwtVerify(token, secretKey(secret), {
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  });
  return parsePayload(payload);
}
