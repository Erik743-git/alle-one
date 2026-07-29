import { expect, type Page } from '@playwright/test';

export function e2eCredentials() {
  return {
    user: process.env.E2E_USER,
    password: process.env.E2E_PASSWORD,
  };
}

/** Login real — requer E2E_WITH_API=1 e E2E_USER / E2E_PASSWORD. */
export async function loginAsE2eUser(page: Page) {
  const { user, password } = e2eCredentials();
  if (!user || !password) {
    throw new Error('Defina E2E_USER e E2E_PASSWORD');
  }
  await page.goto('/login');
  await page.getByPlaceholder('seu.email@empresa.com').fill(user);
  await page.getByPlaceholder('Digite sua senha').fill(password);
  await page.getByRole('button', { name: /^entrar$/i }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
}
