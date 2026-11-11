import { test, expect } from '@playwright/test';
import { HomePage } from '../pages/HomePage';

test('homepage displays restaurant branding and navigation', async ({ page }) => {
  const homePage = new HomePage(page);

  await homePage.open();

  await expect(homePage.restaurantBranding).toBeVisible();
  await expect(homePage.mainHeading).toBeVisible();
  await expect(homePage.viewMenuLink).toBeVisible();
  await expect(homePage.orderNowLink).toBeVisible();
});
