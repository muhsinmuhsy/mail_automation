import { test, expect } from '@playwright/test';

const hasCredentials = !!process.env.E2E_USER_EMAIL && !!process.env.E2E_USER_PASSWORD;

test.describe('custom fields full journey', () => {
  test('create field, add contact, create template, schedule campaign', async ({ page }) => {
    if (!hasCredentials) {
      test.skip();
      return;
    }

    const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3000';
    const response = await page.context().request.post(`${baseURL}/api/auth/sign-in/email`, {
      data: {
        email: process.env.E2E_USER_EMAIL!,
        password: process.env.E2E_USER_PASSWORD!,
      },
    });
    expect(response.ok()).toBeTruthy();

    await page.goto('/settings/fields');
    await expect(page.getByRole('heading', { name: 'Custom Fields' })).toBeVisible();

    await page.getByRole('button', { name: 'Add field' }).click();
    await page.getByLabel('Label').fill('T-shirt size');
    await page.getByLabel('Type').selectOption('text');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('T-shirt size')).toBeVisible();

    await page.goto('/contacts');
    await page.getByRole('button', { name: 'Add contact' }).click();
    await page.getByLabel('Name').fill('Jane Doe');
    await page.getByLabel('Email').fill('jane@example.com');
    await page.getByLabel('T-shirt size').fill('M');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Jane Doe')).toBeVisible();

    await page.goto('/templates');
    await page.getByRole('button', { name: 'New template' }).click();
    await page.getByLabel('Template name').fill('T-shirt promo');
    await page.getByLabel('Subject').fill('Hey {{name}}, your size is {{t_shirt_size}}');
    await page.getByLabel('Body').fill('Hi {{name}}, your T-shirt size is {{t_shirt_size}}.');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('T-shirt promo')).toBeVisible();

    await page.goto('/campaigns');
    await page.getByRole('button', { name: 'New campaign' }).click();
    await page.getByLabel('Campaign name').fill('T-shirt campaign');
    await page.getByLabel('Template').selectOption({ label: 'T-shirt promo' });
    await page.getByRole('button', { name: 'Next' }).click();

    await page.getByText('Jane Doe').click();
    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByRole('button', { name: 'Next' }).click();

    await page.getByRole('button', { name: 'Start campaign' }).click();
    await expect(page.getByText(/scheduled|created/i)).toBeVisible({ timeout: 10_000 });
  });
});
