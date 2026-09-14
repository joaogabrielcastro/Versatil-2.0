import { describe, expect, it } from "vitest";
import { shouldShowDemoCredentials } from "@/lib/ui/show-demo-credentials";

describe("shouldShowDemoCredentials", () => {
  it("bloqueia homepage em produção", () => {
    expect(
      shouldShowDemoCredentials({
        NODE_ENV: "production",
        SHOW_DEMO_CREDENTIALS: "true",
      }),
    ).toBe(false);
  });
});
