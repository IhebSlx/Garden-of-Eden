import { defineConfig, devices } from '@playwright/test';

/**
 * SPEC 10: "Playwright flows per phase". The Phase 1 DoD asks for a smoke suite
 * covering focus / filter / search / add / rename / delete / undo.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  use: {
    baseURL: 'http://127.0.0.1:5179',
    trace: 'on-first-retry',
    // A fixed viewport keeps fit/zoom assertions deterministic.
    viewport: { width: 1440, height: 900 },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm exec vite --port 5179 --strictPort --host 127.0.0.1',
    url: 'http://127.0.0.1:5179',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
