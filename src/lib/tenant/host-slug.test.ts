import { describe, expect, it } from "vitest";
import {
  extractTenantSlugFromHost,
  trustedTenantHeaders,
} from "@/lib/tenant/host-slug";

describe("extractTenantSlugFromHost", () => {
  it("lê slug do subdomínio", () => {
    expect(
      extractTenantSlugFromHost("acme.versatil.app", "https://versatil.app"),
    ).toBe("acme");
  });

  it("não usa host sem subdomínio de academia", () => {
    expect(extractTenantSlugFromHost("localhost:3000")).toBeNull();
    expect(extractTenantSlugFromHost("www.versatil.app")).toBeNull();
    expect(extractTenantSlugFromHost("127.0.0.1")).toBeNull();
    expect(extractTenantSlugFromHost("127.0.0.1:3011")).toBeNull();
    expect(extractTenantSlugFromHost("nao-e-academia.test")).toBeNull();
  });
});

describe("trustedTenantHeaders", () => {
  it("descarta slug forjado pelo cliente e grava o do Host", () => {
    const incoming = new Headers({
      "x-tenant-slug": "forjado",
      host: "academia-a.example.com",
    });
    const out = trustedTenantHeaders(incoming, "academia-a.example.com");
    expect(out.get("x-tenant-slug")).toBe("academia-a");
  });

  it("não deixa header forjado se o Host não identifica academia", () => {
    const incoming = new Headers({
      "x-tenant-slug": "forjado",
      host: "localhost:3000",
    });
    const out = trustedTenantHeaders(incoming, "localhost:3000");
    expect(out.get("x-tenant-slug")).toBeNull();
  });

  it("host A não assume slug B enviado no header", () => {
    const incoming = new Headers({ "x-tenant-slug": "academia-b" });
    const out = trustedTenantHeaders(
      incoming,
      "academia-a.example.com",
      "https://example.com",
    );
    expect(out.get("x-tenant-slug")).toBe("academia-a");
  });
});
