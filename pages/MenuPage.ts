import type { Page } from '@playwright/test';

export class MenuPage {
  constructor(private readonly page: Page) {}

  async open() {
    await this.page.goto('/menu');
  }

  get heading() {
    return this.page.getByRole('heading', {
      name: 'Kashmiri Daal Chawal Menu',
    });
  }

  get searchBox() {
    return this.page.getByPlaceholder(/search dishes/i);
  }

  get allFilter() {
    return this.page.getByRole('button', { name: 'All', exact: true });
  }

  get popularFilter() {
    return this.page.getByRole('button', { name: 'Popular' });
  }

  get newFilter() {
    return this.page.getByRole('button', { name: 'New' });
  }

  get offersFilter() {
    return this.page.getByRole('button', { name: 'Offers' });
  }

  get allCategoriesFilter() {
    return this.page.getByRole('button', { name: 'All categories' });
  }

  async searchDish(dishName: string) {
    await this.searchBox.fill(dishName);
  }

  getDish(dishName: string) {
    return this.page.getByText(dishName, { exact: true });
  }

  get noResultsMessage() {
    return this.page.getByText('No dishes match your filters.');
  }
}
