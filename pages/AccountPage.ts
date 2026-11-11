import type { Page } from '@playwright/test';

export class AccountPage {
  constructor(private readonly page: Page) {}

  async openLogin() {
    await this.page.goto('/account');
  }

  async openRegistration() {
    await this.page.goto('/account?mode=register');
  }

  get heading() {
    return this.page.getByRole('heading', { name: 'Sign up' });
  }

  get firstNameInput() {
    return this.page.getByPlaceholder('First name');
  }

  get lastNameInput() {
    return this.page.getByPlaceholder('Last name');
  }

  get phoneInput() {
    return this.page.getByPlaceholder('Contact number (required)');
  }

  get emailInput() {
    return this.page.getByPlaceholder('Email');
  }

  get passwordInput() {
    return this.page.getByPlaceholder('Password (min 8 characters)');
  }

  get confirmPasswordInput() {
    return this.page.getByPlaceholder('Confirm password');
  }

  get createAccountButton() {
    return this.page.getByRole('button', { name: 'Create account' });
  }

  get errorMessage() {
  return this.page.locator('p[role="alert"]');
}
}
