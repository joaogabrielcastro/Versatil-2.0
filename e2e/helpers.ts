import { expect, type Page } from "@playwright/test";
import { PASSWORD } from "./fixtures";

/** Login pelo formulário, como a recepção faz. */
export async function loginUI(page: Page, slug: string, email: string, password = PASSWORD) {
  await page.goto(`/login?slug=${slug}`);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/balcao/);
}

/**
 * Chamada à API feita de dentro do navegador. Em produção o cookie de sessão é
 * Secure; o navegador o envia para 127.0.0.1, o cliente HTTP do Playwright não.
 */
export async function api(
  page: Page,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; json: unknown }> {
  return page.evaluate(
    async ({ method, path, body }) => {
      const res = await fetch(path, {
        method,
        headers: body === undefined ? undefined : { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await res.text();
      let json: unknown = text;
      try {
        json = JSON.parse(text);
      } catch {
        /* resposta não-JSON */
      }
      return { status: res.status, json };
    },
    { method, path, body },
  );
}

/** Login pela API (prepara dados sem passar pelo formulário). */
export async function loginAPI(page: Page, slug: string, email: string, password = PASSWORD) {
  await page.goto("/login");
  const res = await api(page, "POST", "/api/auth/login", { email, password, tenantSlug: slug });
  expect(res.status, JSON.stringify(res.json)).toBe(200);
}

export async function createStudentAPI(page: Page, fullName: string, cpf: string) {
  const res = await api(page, "POST", "/api/students", { fullName, cpf });
  expect(res.status, JSON.stringify(res.json)).toBe(201);
  return (res.json as { student: { id: string } }).student.id;
}

/** Data/hora atual no formato dos campos do balcão (dd/mm/aaaa HH:mm), em São Paulo. */
export function nowBr(): string {
  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("day")}/${get("month")}/${get("year")} ${get("hour")}:${get("minute")}`;
}
