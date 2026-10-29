
import { test, expect } from '@playwright/test';

test('homepage displays restaurant branding and navigation', async ({ page }) => {
  await page.goto('/');

  await expect(
    page.getByText('Kashmiri Daal Chawal', { exact: true }).first()
  ).toBeVisible();

  await expect(
    page.getByRole('heading', {
      name: 'Kashmiri comfort, plated with warmth.',
    })
  ).toBeVisible();

  await expect(page.getByRole('link', { name: 'View Menu' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Order Now' })).toBeVisible();
});
