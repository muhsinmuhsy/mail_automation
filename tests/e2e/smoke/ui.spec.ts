import { expect, test } from '@playwright/test';

const viewports = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 820, height: 1180 },
  { name: 'desktop', width: 1440, height: 900 },
];

for (const viewport of viewports) {
  test(`login stays usable without horizontal overflow on ${viewport.name}`, async ({ page }) => {
    test.skip(test.info().project.name !== 'desktop', 'explicit viewport matrix runs once');
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto('/login');

    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    // await expect(page.getByLabel('Email')).toBeVisible();
    // await expect(page.getByLabel('Password')).toBeVisible();
    // await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();

    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth
    );
    expect(hasHorizontalOverflow).toBe(false);

    await page.keyboard.press('Tab');
    const focusedOutline = await page.evaluate(() => {
      const element = document.activeElement;
      if (!element) return 'none';
      return window.getComputedStyle(element).outlineStyle;
    });
    expect(focusedOutline).not.toBe('none');
  });

  // test(`register stays usable without horizontal overflow on ${viewport.name}`, async ({ page }) => {
  //   test.skip(test.info().project.name !== 'desktop', 'explicit viewport matrix runs once');
  //   await page.setViewportSize({ width: viewport.width, height: viewport.height });
  //   await page.goto('/register');
  //
  //   await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible();
  //   await expect(page.getByLabel('Name')).toBeVisible();
  //   await expect(page.getByLabel('Email')).toBeVisible();
  //   await expect(page.getByLabel('Password')).toBeVisible();
  //
  //   const hasHorizontalOverflow = await page.evaluate(
  //     () => document.documentElement.scrollWidth > document.documentElement.clientWidth
  //   );
  //   expect(hasHorizontalOverflow).toBe(false);
  // });

  // test(`password reset stays usable without horizontal overflow on ${viewport.name}`, async ({ page }) => {
  //   test.skip(test.info().project.name !== 'desktop', 'explicit viewport matrix runs once');
  //   await page.setViewportSize({ width: viewport.width, height: viewport.height });
  //   await page.goto('/forgot-password');
  //
  //   await expect(page.getByRole('heading', { name: 'Reset your password' })).toBeVisible();
  //   await expect(page.getByLabel('Email')).toBeVisible();
  //   await expect(page.getByRole('button', { name: 'Send reset link' })).toBeVisible();
  //
  //   const hasHorizontalOverflow = await page.evaluate(
  //     () => document.documentElement.scrollWidth > document.documentElement.clientWidth
  //   );
  //   expect(hasHorizontalOverflow).toBe(false);
  // });

  // test(`email verification stays usable without horizontal overflow on ${viewport.name}`, async ({ page }) => {
  //   test.skip(test.info().project.name !== 'desktop', 'explicit viewport matrix runs once');
  //   await page.setViewportSize({ width: viewport.width, height: viewport.height });
  //   await page.goto('/verify-email');
  //
  //   await expect(page.getByRole('heading', { name: 'Verify your email' })).toBeVisible();
  //   await expect(page.getByLabel('Verification code')).toBeVisible();
  //   await expect(page.getByRole('button', { name: 'Verify email' })).toBeVisible();
  //   await expect(page.getByRole('button', { name: 'Resend verification email' })).toBeVisible();
  //
  //   const hasHorizontalOverflow = await page.evaluate(
  //     () => document.documentElement.scrollWidth > document.documentElement.clientWidth
  //   );
  //   expect(hasHorizontalOverflow).toBe(false);
  // });
}
