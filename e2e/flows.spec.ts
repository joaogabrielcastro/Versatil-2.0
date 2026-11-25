import { expect, test, type Locator } from "@playwright/test";
import { PASSWORD, TENANT_A, TENANT_B, validCpf } from "./fixtures";
import { api, createStudentAPI, loginAPI, loginUI, nowBr } from "./helpers";

const run = Date.now() % 1_000_000_000;

/** Seleciona o primeiro plano cujo texto contém `text`. */
async function choosePlan(scope: Locator, text: string) {
  const select = scope.locator("select").first();
  const value = await select.locator("option", { hasText: text }).first().getAttribute("value");
  await select.selectOption(value!);
}

test.describe("fluxos do balcão", () => {
  test("login pelo formulário abre o painel com faturado e recebido separados", async ({ page }) => {
    await loginUI(page, TENANT_A.slug, TENANT_A.admin);
    await expect(page.getByRole("heading", { name: "Painel" })).toBeVisible();
    await expect(page.getByRole("paragraph").filter({ hasText: /^Faturado$/ })).toBeVisible();
    await expect(page.getByRole("paragraph").filter({ hasText: /^Recebido$/ })).toBeVisible();
    await expect(page.getByRole("img", { name: "Versátil Academia" }).first()).toBeVisible();
  });

  test("senha errada mantém na tela de login com mensagem", async ({ page }) => {
    await page.goto(`/login?slug=${TENANT_A.slug}`);
    await page.getByLabel("E-mail").fill(TENANT_A.admin);
    await page.getByLabel("Senha", { exact: true }).fill("senha-errada-000");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.getByText(/credenciais inválidas/i)).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test("cadastro de aluno recusa CPF inválido e aceita o válido", async ({ page }) => {
    await loginUI(page, TENANT_A.slug, TENANT_A.admin);
    await page.goto("/balcao/alunos");
    const name = `Aluno E2E ${run}`;
    await page.getByLabel("Nome completo").fill(name);
    await page.getByLabel("CPF").fill("111.111.111-11");
    await page.getByRole("button", { name: "Cadastrar aluno" }).click();
    await expect(page.getByText("Informe um CPF válido")).toBeVisible();

    await page.getByLabel("CPF").fill(validCpf(run));
    await page.getByRole("button", { name: "Cadastrar aluno" }).click();
    await expect(page.getByText("Aluno cadastrado com sucesso.")).toBeVisible();

    await page.getByPlaceholder("Buscar aluno…").fill(name);
    await expect(page.getByRole("link", { name }).first()).toBeVisible();
  });

  test("matrícula gera fatura; pagamento no balcão deixa o aluno ativo", async ({ page }) => {
    await loginUI(page, TENANT_A.slug, TENANT_A.admin);
    const id = await createStudentAPI(page, `Matrícula E2E ${run}`, validCpf(run + 1));
    await page.goto(`/balcao/alunos/${id}`);

    const subs = page.locator("#student-assinaturas");
    await choosePlan(subs, "Mensal");
    await subs.getByPlaceholder("dd/mm/aaaa HH:mm").first().fill(nowBr());
    await subs.getByRole("button", { name: "Associar plano" }).click();
    await expect(page.getByText("Plano associado ao aluno.")).toBeVisible();

    const billing = page.locator("#student-cobranca");
    page.once("dialog", (d) => void d.accept());
    await billing.getByRole("button", { name: "Registrar pagamento" }).first().click();
    await expect(page.getByText("Pagamento registrado.")).toBeVisible();

    await page.reload();
    await expect(page.getByText("Ativo", { exact: true }).first()).toBeVisible();
    // Segunda matrícula na mesma modalidade é recusada (sem cobrança em dobro).
    await choosePlan(subs, "Mensal");
    await subs.getByPlaceholder("dd/mm/aaaa HH:mm").first().fill(nowBr());
    await subs.getByRole("button", { name: "Associar plano" }).click();
    await expect(page.getByText(/já tem matrícula vigente/)).toBeVisible();
  });

  test("recepção não vê nem acessa a gestão de usuários", async ({ page, browser }) => {
    await loginAPI(page, TENANT_A.slug, TENANT_A.admin);
    const email = `recep-${run}@e2e-a.test`;
    const created = await api(page, "POST", "/api/tenant/users", {
      email,
      password: PASSWORD,
      role: "tenant_user",
    });
    expect(created.status, JSON.stringify(created.json)).toBe(201);

    const ctx = await browser.newContext();
    const recep = await ctx.newPage();
    await loginUI(recep, TENANT_A.slug, email);
    await expect(recep.getByRole("link", { name: "Usuários" })).toHaveCount(0);
    await recep.goto("/balcao/configuracoes/usuarios");
    await expect(recep).toHaveURL(/\/balcao$/);
    expect((await api(recep, "GET", "/api/tenant/users")).status).toBe(403);
    await ctx.close();
  });

  test("academia B não abre o aluno da academia A", async ({ page, browser }) => {
    await loginAPI(page, TENANT_A.slug, TENANT_A.admin);
    const id = await createStudentAPI(page, `Isolamento ${run}`, validCpf(run + 2));

    const ctx = await browser.newContext();
    const b = await ctx.newPage();
    await loginUI(b, TENANT_B.slug, TENANT_B.admin);
    const res = await b.goto(`/balcao/alunos/${id}`);
    expect(res?.status()).toBe(404);
    expect((await api(b, "GET", `/api/students/${id}`)).status).toBe(404);
    await ctx.close();
  });

  test("depois de sair, o balcão pede login de novo", async ({ page }) => {
    await loginUI(page, TENANT_A.slug, TENANT_A.admin);
    await page.getByRole("button", { name: "Sair" }).locator("visible=true").first().click();
    await expect(page).toHaveURL(/\/login/);
    await page.goto("/balcao/alunos");
    await expect(page).toHaveURL(/\/login/);
  });
});
