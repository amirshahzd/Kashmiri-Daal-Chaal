
import { test, expect } from '@playwright/test';

test('menu page displays heading, search and filter controls', async ({ page }) => {
  await page.goto('/menu');

  await expect(
    page.getByRole('heading', { name: 'Kashmiri Daal Chawal Menu' })
  ).toBeVisible();

  await expect(
    page.getByPlaceholder(/search dishes/i)
  ).toBeVisible();

  await expect(page.getByRole('button', { name: 'All', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Popular' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'New' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Offers' })).toBeVisible();

  await expect(
    page.getByRole('button', { name: 'All categories' })
  ).toBeVisible();
});

test('customer can search for Chicken Biryani', async ({ page }) => {
  await page.goto('/menu');

  const searchBox = page.getByPlaceholder(/search dishes/i);
  await expect(searchBox).toBeVisible();

  await searchBox.fill('Chicken Biryani');

  await expect(
    page.getByText('Chicken Biryani', { exact: true })
  ).toBeVisible();

  await expect(
    page.getByText('No dishes match your filters.')
  ).not.toBeVisible();
});
