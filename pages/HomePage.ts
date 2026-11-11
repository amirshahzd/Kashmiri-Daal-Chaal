import type { Page } from '@playwright/test';

export class HomePage {
  constructor(private readonly page: Page) {}

  async open() {
    await this.page.goto('/');
  }

  get restaurantBranding() {
    return this.page.getByText('Kashmiri Daal Chawal', { exact: true }).first();
  }

  get mainHeading() {
    return this.page.getByRole('heading', {
      name: 'Kashmiri comfort, plated with warmth.',
    });
  }

  get viewMenuLink() {
    return this.page.getByRole('link', { name: 'View Menu' });
  }

  get orderNowLink() {
    return this.page.getByRole('link', { name: 'Order Now' });
  }
}
