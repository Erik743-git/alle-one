import { expect, type Page, test } from '@playwright/test';

const e2eUser = process.env.E2E_USER;
const e2ePassword = process.env.E2E_PASSWORD;

async function login(page: Page) {
  await page.goto('/login');
  await page.getByPlaceholder('seu.email@empresa.com').fill(e2eUser!);
  await page.getByPlaceholder('Digite sua senha').fill(e2ePassword!);
  await page.getByRole('button', { name: /^entrar$/i }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
}

test.describe('Reconhecimento no Console', () => {
  test.skip(!process.env.E2E_WITH_API, 'Defina E2E_WITH_API=1 com API rodando');
  test.skip(
    !e2eUser || !e2ePassword,
    'Defina E2E_USER e E2E_PASSWORD para autenticação',
  );

  test('carrega os alertas ou aplica o bloqueio de permissão', async ({ page }) => {
    await login(page);
    await page.goto('/console');

    const heading = page.getByRole('heading', { name: 'Console', exact: true });
    const permissionGate = page.getByText('Sem permissão para este módulo');

    await expect
      .poll(
        async () =>
          (await heading.isVisible()) ||
          (await permissionGate.isVisible()) ||
          new URL(page.url()).pathname === '/dashboard',
        { timeout: 15_000 },
      )
      .toBe(true);

    if (await heading.isVisible()) {
      await expect(page.getByText('Reconhecimento', { exact: true })).toBeVisible();
      await expect(page.getByPlaceholder('Host ou problema…')).toBeVisible();
      return;
    }

    if (await permissionGate.isVisible()) {
      await expect(permissionGate).toBeVisible();
    } else {
      await expect(page).toHaveURL(/\/dashboard/);
    }
  });
});
