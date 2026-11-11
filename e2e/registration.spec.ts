import { test, expect } from '@playwright/test';
import { AccountPage } from '../pages/AccountPage';

test('REG-001: registration page displays all required fields', async ({ page }) => {
  const accountPage = new AccountPage(page);

  // Arrange: Open the registration page
  await accountPage.openRegistration();

  // Assert: Check the page heading
  await expect(accountPage.heading).toBeVisible();

  // Assert: Check the required registration fields
  await expect(accountPage.firstNameInput).toBeVisible();
  await expect(accountPage.lastNameInput).toBeVisible();
  await expect(accountPage.phoneInput).toBeVisible();
  await expect(accountPage.emailInput).toBeVisible();
  await expect(accountPage.passwordInput).toBeVisible();
  await expect(accountPage.confirmPasswordInput).toBeVisible();

  // Assert: Check the registration button
  await expect(accountPage.createAccountButton).toBeVisible();
});

test('REG-002: registration rejects passwords that do not match', async ({ page }) => {
  const accountPage = new AccountPage(page);

  await accountPage.openRegistration();

  await accountPage.firstNameInput.fill('Test');
  await accountPage.lastNameInput.fill('Customer');
  await accountPage.phoneInput.fill('07123456789');
  await accountPage.emailInput.fill('test.customer@example.com');
  await accountPage.passwordInput.fill('Password123');
  await accountPage.confirmPasswordInput.fill('Different123');

  await accountPage.createAccountButton.click();

  await expect(accountPage.errorMessage).toHaveText('Passwords do not match.');
});

test('REG-003: registration rejects an empty first name', async ({ page }) => {
  const accountPage = new AccountPage(page);

  await accountPage.openRegistration();

  await accountPage.lastNameInput.fill('Customer');
  await accountPage.phoneInput.fill('07123456789');
  await accountPage.emailInput.fill('test.customer@example.com');
  await accountPage.passwordInput.fill('Password123');
  await accountPage.confirmPasswordInput.fill('Password123');

  await accountPage.createAccountButton.click();

  const isValid = await accountPage.firstNameInput.evaluate(
    (input) => (input as HTMLInputElement).validity.valid
  );

  expect(isValid).toBe(false);
});

test('REG-004: registration rejects an empty last name', async ({ page }) => {
  const accountPage = new AccountPage(page);

  await accountPage.openRegistration();

  await accountPage.firstNameInput.fill('Test');
  await accountPage.phoneInput.fill('07123456789');
  await accountPage.emailInput.fill('test.customer@example.com');
  await accountPage.passwordInput.fill('Password123');
  await accountPage.confirmPasswordInput.fill('Password123');

  await accountPage.createAccountButton.click();

  const isValid = await accountPage.lastNameInput.evaluate(
    (input) => (input as HTMLInputElement).validity.valid
  );

  expect(isValid).toBe(false);
});

test('REG-005: registration rejects an empty phone number', async ({ page }) => {
  const accountPage = new AccountPage(page);

  await accountPage.openRegistration();

  await accountPage.firstNameInput.fill('Test');
  await accountPage.lastNameInput.fill('Customer');
  // Deliberately leave the phone number empty.
  await accountPage.emailInput.fill('test.customer@example.com');
  await accountPage.passwordInput.fill('Password123');
  await accountPage.confirmPasswordInput.fill('Password123');

  await accountPage.createAccountButton.click();

  const isValid = await accountPage.phoneInput.evaluate(
    (input) => (input as HTMLInputElement).validity.valid
  );

  expect(isValid).toBe(false);
});

test('REG-006: registration rejects a phone number shorter than 7 characters', async ({ page }) => {
  const accountPage = new AccountPage(page);

  await accountPage.openRegistration();

  await accountPage.firstNameInput.fill('Test');
  await accountPage.lastNameInput.fill('Customer');
  await accountPage.phoneInput.fill('123456');
  await accountPage.emailInput.fill('test.customer@example.com');
  await accountPage.passwordInput.fill('Password123');
  await accountPage.confirmPasswordInput.fill('Password123');

  await accountPage.createAccountButton.click();

  const isTooShort = await accountPage.phoneInput.evaluate(
    (input) => (input as HTMLInputElement).validity.tooShort
  );

  expect(isTooShort).toBe(true);
});

test('REG-007: registration rejects an empty email address', async ({ page }) => {
  const accountPage = new AccountPage(page);

  await accountPage.openRegistration();

  await accountPage.firstNameInput.fill('Test');
  await accountPage.lastNameInput.fill('Customer');
  await accountPage.phoneInput.fill('07123456789');
  // Deliberately leave the email field empty.
  await accountPage.passwordInput.fill('Password123');
  await accountPage.confirmPasswordInput.fill('Password123');

  await accountPage.createAccountButton.click();

  const isMissing = await accountPage.emailInput.evaluate(
    (input) => (input as HTMLInputElement).validity.valueMissing
  );

  expect(isMissing).toBe(true);
});

test('REG-008: registration rejects an invalid email format', async ({ page }) => {
  const accountPage = new AccountPage(page);

  await accountPage.openRegistration();

  await accountPage.firstNameInput.fill('Test');
  await accountPage.lastNameInput.fill('Customer');
  await accountPage.phoneInput.fill('07123456789');
  await accountPage.emailInput.fill('invalid-email');
  await accountPage.passwordInput.fill('Password123');
  await accountPage.confirmPasswordInput.fill('Password123');

  await accountPage.createAccountButton.click();

  const hasInvalidFormat = await accountPage.emailInput.evaluate(
    (input) => (input as HTMLInputElement).validity.typeMismatch
  );

  expect(hasInvalidFormat).toBe(true);
});
