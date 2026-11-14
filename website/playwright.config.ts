import { defineConfig } from '@playwright/test';

const port = Number(process.env.LUMEN_TEST_PORT || 4191);
export default defineConfig({
  testDir: './tests',
  timeout: 45_000,
  retries: 0,
  workers: 1,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    viewport: { width: 1440, height: 1000 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `pnpm exec lumen serve --host 127.0.0.1 --port ${port}`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
