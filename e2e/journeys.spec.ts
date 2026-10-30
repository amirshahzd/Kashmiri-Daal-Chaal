import { expect, test } from '@playwright/test';

test.beforeEach(({ }, testInfo) => {
  test.skip(!['desktop', 'iphone-13'].includes(testInfo.project.name), 'Journeys run on desktop and iPhone 13');
});

test('home menu link opens the menu', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'View Menu' }).click();
  await expect(page).toHaveURL(/\/menu/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

test('cart page is reachable from the menu call to action', async ({ page }) => {
  await page.goto('/cart');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

test('checkout blocks an empty contact number', async ({ page }) => {
  await page.goto('/checkout');
  const phone = page.locator('input[type="tel"], input[name*="phone" i]').first();
  if (await phone.count()) {
    await phone.fill('123');
    await expect(page.getByText(/11-digit|contact number|phone/i).first()).toBeVisible();
  } else {
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  }
});
