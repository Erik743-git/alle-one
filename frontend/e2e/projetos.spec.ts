import { expect, test } from "@playwright/test";
import { e2eCredentials, loginAsE2eUser } from "./helpers/login";

const { user: e2eUser, password: e2ePassword } = e2eCredentials();

test.describe("Projetos", () => {
  test.skip(!process.env.E2E_WITH_API, "Defina E2E_WITH_API=1 com API rodando");
  test.skip(
    !e2eUser || !e2ePassword,
    "Defina E2E_USER e E2E_PASSWORD para autenticação",
  );

  test("lista empresas ou aplica bloqueio de permissão", async ({ page }) => {
    await loginAsE2eUser(page);
    await page.goto("/projetos");

    const heading = page.getByRole("heading", { name: /Projetos/i });
    const permissionGate = page.getByText("Sem permissão para este módulo");

    await expect
      .poll(
        async () =>
          (await heading.isVisible()) ||
          (await permissionGate.isVisible()) ||
          new URL(page.url()).pathname === "/dashboard",
        { timeout: 15_000 },
      )
      .toBe(true);

    const body = await page.locator("body").innerText();
    expect(body).not.toContain("Cannot GET /api/projetos");
  });

  test("rota /projetos/:uuid não exibe JSON de erro da API", async ({
    page,
  }) => {
    await loginAsE2eUser(page);
    await page.goto("/projetos/00000000-0000-4000-8000-000000000001");

    await expect
      .poll(async () => page.locator("body").innerText(), { timeout: 10_000 })
      .not.toContain("Cannot GET /api/projetos");
  });
});
