import { test, expect } from '@playwright/test';
import { MenuPage } from '../pages/MenuPage';

test('menu page displays heading, search and filter controls', async ({ page }) => {
  const menuPage = new MenuPage(page);

  await menuPage.open();

  await expect(menuPage.heading).toBeVisible();
  await expect(menuPage.searchBox).toBeVisible();
  await expect(menuPage.allFilter).toBeVisible();
  await expect(menuPage.popularFilter).toBeVisible();
  await expect(menuPage.newFilter).toBeVisible();
  await expect(menuPage.offersFilter).toBeVisible();
  await expect(menuPage.allCategoriesFilter).toBeVisible();
});

test('customer can search for Chicken Biryani', async ({ page }) => {
  const menuPage = new MenuPage(page);

  await menuPage.open();

  await expect(menuPage.searchBox).toBeVisible();

  await menuPage.searchDish('Chicken Biryani');

  await expect(menuPage.getDish('Chicken Biryani')).toBeVisible();
  await expect(menuPage.noResultsMessage).not.toBeVisible();
});
