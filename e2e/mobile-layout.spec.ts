import { expect, test } from '@playwright/test';

const routes = ['/', '/menu', '/cart', '/checkout', '/account', '/order'];

test.beforeEach(({ }, testInfo) => {
  test.skip(
    !['phone-360', 'iphone-13', 'pixel-7'].includes(testInfo.project.name),
    'Layout checks run on the three phone widths'
  );
});

for (const route of routes) {
  test(`${route} does not scroll sideways and keeps a 44px action`, async ({ page }) => {
    await page.goto(route);
    const overflow = await page.evaluate(() => {
      const root = document.documentElement;
      return root.scrollWidth - root.clientWidth;
    });
    expect(overflow).toBeLessThanOrEqual(1);

    const viewport = page.viewportSize();
    expect(viewport).not.toBeNull();
    const action = page.locator('a.kdc-button, button.kdc-button, header a, header button').first();
    await expect(action).toBeVisible();
    const box = await action.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y).toBeLessThan(viewport!.height);
  });
}

test('checkout inputs stay at least 16px so mobile browsers do not zoom', async ({ page }) => {
  await page.goto('/checkout');
  const size = await page.evaluate(() => {
    const input = document.querySelector('input, textarea') as HTMLElement | null;
    if (!input) return 16;
    return Number.parseFloat(getComputedStyle(input).fontSize);
  });
  expect(size).toBeGreaterThanOrEqual(16);
});
