import { expect, type Page } from '@playwright/test';

/** Rotas autenticadas usadas no smoke de proteção (sem sessão → /login). */
export const PROTECTED_APP_ROUTES = [
  '/dashboard',
  '/tickets',
  '/apontamentos',
  '/gmud',
  '/inventario',
  '/projetos',
  '/financeiro',
] as const;

export async function expectRedirectToLogin(page: Page, path: string) {
  await page.goto(path);
  await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
}
