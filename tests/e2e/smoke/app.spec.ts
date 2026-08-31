import { expect, test } from '@playwright/test';

test.describe('application smoke', () => {
  test('serves the health endpoint', async ({ request }) => {
    const response = await request.get('/api/health');

    expect(response.ok()).toBe(true);
    await expect(await response.json()).toEqual({
      status: 'ok',
      version: '1.0.0',
    });
  });

  test('renders the login page', async ({ page }) => {
    await page.goto('/login');

    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  });

  test('protects the dashboard for signed-out users', async ({ page }) => {
    await page.goto('/dashboard');

    await expect(page).toHaveURL(/\/login(?:\?|$)/);
  });
});
