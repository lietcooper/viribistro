import { defineConfig, devices } from '@playwright/test';

const backendPort = 3100;
const frontendPort = 8090;

export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: `http://localhost:${frontendPort}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: [
    {
      command:
        `PORT=${backendPort} ` +
        'NODE_ENV=test ' +
        'E2E_FAKE_AI=1 ' +
        'FRONTEND_URL=http://localhost:8090 ' +
        'DATABASE_URL="postgresql://bistro:bistro@localhost:5433/bistro_e2e?schema=public" ' +
        'JWT_SECRET="e2e-jwt-secret-32-bytes-of-randomness" ' +
        'JWT_REFRESH_SECRET="e2e-refresh-secret-32-byte-padding" ' +
        'ANTHROPIC_MODEL="e2e-fake" ' +
        'npm run dev',
      cwd: '../backend',
      url: `http://localhost:${backendPort}/healthz`,
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command:
        `EXPO_PUBLIC_API_URL=http://localhost:${backendPort} ` +
        `npm run web -- --port ${frontendPort} --host localhost`,
      url: `http://localhost:${frontendPort}`,
      reuseExistingServer: false,
      timeout: 90_000,
    },
  ],
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
