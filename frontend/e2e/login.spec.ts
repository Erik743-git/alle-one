import { expect, test } from '@playwright/test';
import {
  expectRedirectToLogin,
  PROTECTED_APP_ROUTES,
} from './helpers/protected-routes';

test.describe('Login', () => {
  test('exibe formulário de entrada', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByText('E-mail', { exact: true })).toBeVisible();
    await expect(page.getByText('Senha', { exact: true })).toBeVisible();
    await expect(page.getByPlaceholder('seu.email@empresa.com')).toBeVisible();
    await expect(page.getByRole('button', { name: /^entrar$/i })).toBeVisible();
  });

  test('rejeita credenciais inválidas', async ({ page }) => {
    test.skip(!process.env.E2E_WITH_API, 'Defina E2E_WITH_API=1 com API rodando');

    await page.goto('/login');
    await page
      .getByPlaceholder('seu.email@empresa.com')
      .fill('nao-existe@alleone.test');
    await page.getByPlaceholder('Digite sua senha').fill('Senha@Invalida1');
    await page.getByRole('button', { name: /^entrar$/i }).click();
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByText(/inválid|não foi possível/i)).toBeVisible({
      timeout: 10_000,
    });
  });
});

test.describe('Proteção de rotas', () => {
  for (const path of PROTECTED_APP_ROUTES) {
    test(`redireciona ${path} para login sem sessão`, async ({ page }) => {
      await expectRedirectToLogin(page, path);
    });
  }
});
