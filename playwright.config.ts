import { defineConfig, devices } from '@playwright/test';

const skipBrowserDownload = !process.env.CI;

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: 'http://127.0.0.1:3000',
    trace: 'on-first-retry',
  },
  webServer: [
    {
      command: 'npm run dev -w backend',
      url: 'http://127.0.0.1:4000/health',
      reuseExistingServer: skipBrowserDownload,
      timeout: 120_000,
    },
    {
      command: 'npm run dev -w frontend',
      url: 'http://127.0.0.1:3000',
      reuseExistingServer: skipBrowserDownload,
      timeout: 180_000,
    },
  ],
  projects: [
    { name: 'desktop', use: { viewport: { width: 1280, height: 720 } } },
    { name: 'iphone-13', use: { ...devices['iPhone 13'] } },
    {
      name: 'phone-360',
      use: { viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true },
    },
    { name: 'pixel-7', use: { ...devices['Pixel 7'] } },
  ],
});
