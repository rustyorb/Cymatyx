import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  webServer: { command: 'npm run dev', port: 3000, reuseExistingServer: true, timeout: 60_000 },
  use: {
    baseURL: 'http://localhost:3000',
    launchOptions: {
      args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
    },
  },
});
