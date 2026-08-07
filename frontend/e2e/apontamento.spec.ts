import { expect, test } from '@playwright/test';
import { e2eCredentials, loginAsE2eUser } from './helpers/login';

const { user: e2eUser, password: e2ePassword } = e2eCredentials();

test.describe('Apontamentos', () => {
  test.skip(!process.env.E2E_WITH_API, 'Defina E2E_WITH_API=1 com API rodando');
  test.skip(
    !e2eUser || !e2ePassword,
    'Defina E2E_USER e E2E_PASSWORD para autenticação',
  );

  test('carrega a agenda ou aplica o bloqueio de acesso', async ({ page }) => {
    await loginAsE2eUser(page);
    await page.goto('/apontamentos');

    const heading = page.getByRole('heading', {
      name: 'Apontamentos',
      exact: true,
    });
    const permissionGate = page.getByText('Sem permissão para este módulo');

    await expect
      .poll(
        async () =>
          (await heading.isVisible()) ||
          (await permissionGate.isVisible()) ||
          ['/dashboard', '/financeiro'].includes(new URL(page.url()).pathname),
        { timeout: 15_000 },
      )
      .toBe(true);

    if (await heading.isVisible()) {
      await expect(page).toHaveURL(/\/apontamentos(?:\/[^/]+)?$/);
      return;
    }

    if (await permissionGate.isVisible()) {
      await expect(permissionGate).toBeVisible();
    } else {
      await expect(page).toHaveURL(/\/(?:dashboard|financeiro)/);
    }
  });
});
