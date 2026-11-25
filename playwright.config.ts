import { defineConfig, devices } from "@playwright/test";

/**
 * Testes de ponta a ponta no navegador (fluxos reais do balcão).
 *
 * Pré-requisitos: Postgres e Redis no ar, migrations aplicadas e `npm run build`.
 * - E2E_BASE_URL aponta para um servidor já rodando; sem ela, sobe `npm run start`.
 * - E2E_SEED_DATABASE_URL: login dono das tabelas, usado só para criar as academias de teste.
 *
 *   npm run build && npm run test:e2e
 */
const baseURL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "off",
    screenshot: "only-on-failure",
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] }, testIgnore: /responsive\.spec\.ts/ },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /responsive\.spec\.ts/ },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npm run start",
        url: `${baseURL}/login`,
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
