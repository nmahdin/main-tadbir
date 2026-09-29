import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e', testMatch: process.env.E2E_LIVE === 'true' ? 'live-backend.spec.ts' : process.env.E2E_DEMO === 'true' ? 'demo-mode.spec.ts' : ['phase1.spec.ts','phase2.spec.ts'], fullyParallel: false, workers: 1, retries: 0,
  use: { baseURL: process.env.E2E_BASE_URL || 'http://127.0.0.1:3000', headless: true,
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined, args: ['--no-sandbox', '--disable-dev-shm-usage', '--no-zygote'] } },
  reporter: 'list', outputDir: 'test-results',
});
