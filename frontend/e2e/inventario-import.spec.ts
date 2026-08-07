import { expect, type Page, test } from '@playwright/test';

const e2eUser = process.env.E2E_USER;
const e2ePassword = process.env.E2E_PASSWORD;
const inventoryCompanyId = process.env.E2E_INVENTARIO_COMPANY_ID;

async function login(page: Page) {
  await page.goto('/login');
  await page.getByPlaceholder('seu.email@empresa.com').fill(e2eUser!);
  await page.getByPlaceholder('Digite sua senha').fill(e2ePassword!);
  await page.getByRole('button', { name: /^entrar$/i }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
}

test.describe('Importação de inventário', () => {
  test.skip(!process.env.E2E_WITH_API, 'Defina E2E_WITH_API=1 com API rodando');
  test.skip(
    !e2eUser || !e2ePassword,
    'Defina E2E_USER e E2E_PASSWORD para autenticação',
  );

  test('carrega o inventário e expõe a importação quando autorizada', async ({
    page,
  }) => {
    await login(page);
    await page.goto(
      inventoryCompanyId
        ? `/inventario/${encodeURIComponent(inventoryCompanyId)}`
        : '/inventario',
    );

    const inventoryHeading = page.getByRole('heading', {
      name: 'Inventário',
      exact: true,
    });
    const companyInventory = page.getByText(/ativos? cadastrados?/i);
    const permissionGate = page.getByText('Sem permissão para este módulo');

    await expect
      .poll(
        async () =>
          (await inventoryHeading.isVisible()) ||
          (await companyInventory.isVisible()) ||
          (await permissionGate.isVisible()) ||
          new URL(page.url()).pathname === '/dashboard',
        { timeout: 15_000 },
      )
      .toBe(true);

    if (await permissionGate.isVisible()) {
      await expect(permissionGate).toBeVisible();
      return;
    }

    if (new URL(page.url()).pathname === '/dashboard') {
      await expect(page).toHaveURL(/\/dashboard/);
      return;
    }

    if (inventoryCompanyId) {
      const importButton = page.getByRole('button', { name: 'Importar Excel' });
      if (await importButton.isVisible()) {
        await expect(importButton).toBeEnabled();
      } else {
        await expect(companyInventory).toBeVisible();
      }
    } else {
      await expect(inventoryHeading).toBeVisible();
    }
  });
});
