import { describe, expect, it } from "vitest";
import { requireConfiguredBearer } from "@/lib/webhooks/require-bearer";

describe("requireConfiguredBearer", () => {
  it("falha fechado sem secret", () => {
    const r = requireConfiguredBearer(undefined, "Bearer anything", "ausente");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(503);
  });

  it("rejeita secret errado", () => {
    const r = requireConfiguredBearer("correto-secret-16", "Bearer outro", "ausente");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(401);
  });

  it("aceita bearer correto", () => {
    expect(
      requireConfiguredBearer(
        "correto-secret-16",
        "Bearer correto-secret-16",
        "ausente",
      ),
    ).toEqual({ ok: true });
  });

  it("rejeita ausência de header", () => {
    const r = requireConfiguredBearer("correto-secret-16", null, "ausente");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(401);
  });
});
