import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SRC = path.resolve(process.cwd(), "src");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

function rel(file: string) {
  return path.relative(SRC, file).replaceAll("\\", "/");
}

const FORBIDDEN_IMPORT = /from\s+["']stripe["']|require\(["']stripe["']\)/;
const PAGARME_CLIENT = /PagarmeClient|pagarmeProvider|getPagarmeClient/;
const PAGARME_PATH =
  /payments\/providers\/pagarme|billing\/pagarme|webhooks\/pagarme/;
const STRIPE_PATH =
  /billing\/stripe|webhooks\/stripe|stripe-resolve|STRIPE_SECRET_KEY/;

describe("arquitetura Stone-only", () => {
  const files = walk(SRC);

  it("domínio financeiro não importa clientes de gateway", () => {
    const billing = files.filter((f) =>
      rel(f).startsWith("lib/services/billing/"),
    );
    expect(billing.length).toBeGreaterThan(0);
    for (const file of billing) {
      const src = readFileSync(file, "utf8");
      expect(src, rel(file)).not.toMatch(PAGARME_CLIENT);
      expect(src, rel(file)).not.toMatch(FORBIDDEN_IMPORT);
      expect(src, rel(file)).not.toMatch(/StoneConnectHttpClient/);
      expect(src, rel(file)).not.toMatch(/api\.pagar\.me/);
    }
  });

  it("nenhum fluxo de produto importa Pagar.me legado ou Stripe", () => {
    const product = files.filter((f) => {
      const r = rel(f);
      return (
        !r.startsWith("lib/payments/providers/stone/") &&
        !r.endsWith("architecture.test.ts") &&
        !r.endsWith("stone-only.test.ts")
      );
    });
    for (const file of product) {
      const src = readFileSync(file, "utf8");
      expect(src, rel(file)).not.toMatch(FORBIDDEN_IMPORT);
      expect(src, rel(file)).not.toMatch(PAGARME_CLIENT);
      expect(src, rel(file)).not.toMatch(PAGARME_PATH);
      expect(src, rel(file)).not.toMatch(STRIPE_PATH);
    }
  });

  it("recorrência chama Stone, não checkout legado", () => {
    const src = readFileSync(
      path.join(SRC, "lib/services/billing/recurring-charge.ts"),
      "utf8",
    );
    expect(src).toContain("chargeInvoiceOnStone");
    expect(src).not.toMatch(/createCheckout|pagarme/i);
  });

  it("balcão cobra via Stone e não oferece checkout Pagar.me", () => {
    const src = readFileSync(
      path.join(SRC, "components/balcao/cobranca-balcao-client.tsx"),
      "utf8",
    );
    expect(src).toContain("StoneChargeButton");
    expect(src).not.toMatch(/PagarmeChargeButton|pagarme\/checkout/i);
  });
});
