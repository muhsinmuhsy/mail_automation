import { expect, test } from '@playwright/test';

const authScreens = [
  { path: '/login', name: 'login' },
  { path: '/register', name: 'register' },
  { path: '/forgot-password', name: 'forgot-password' },
  { path: '/verify-email', name: 'verify-email' },
];

test.describe('public auth visual regression', () => {
  for (const screen of authScreens) {
    test(`${screen.name} desktop`, async ({ page }) => {
      test.skip(test.info().project.name !== 'desktop', 'visual baselines are captured once');
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(screen.path);
      await page.addStyleTag({
        content: 'nextjs-portal, [data-nextjs-toast], [data-nextjs-dialog-overlay] { display: none !important; }',
      });
      await expect(page).toHaveScreenshot(`${screen.name}-desktop.png`, {
        animations: 'disabled',
        fullPage: true,
      });
    });
  }
});
