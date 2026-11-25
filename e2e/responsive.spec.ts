import { expect, test } from "@playwright/test";
import { TENANT_A } from "./fixtures";
import { loginAPI } from "./helpers";

/** Telas do dia a dia no celular: nada pode exigir rolagem horizontal. */
for (const path of ["/balcao", "/balcao/alunos", "/balcao/cobranca", "/balcao/relatorios"]) {
  test(`sem rolagem horizontal no celular: ${path}`, async ({ page }) => {
    await loginAPI(page, TENANT_A.slug, TENANT_A.admin);
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `${path} rola ${overflow}px na horizontal`).toBeLessThanOrEqual(1);
  });
}
