import { defineConfig } from '@playwright/test';
export default defineConfig({
 testDir: './tests/pwa', timeout: 60000, workers: 1,
 use: {baseURL: 'http://127.0.0.1:4320', headless: true},
 webServer: [
  {command: 'node tests/helpers/simulation-backend.mjs', url: 'http://127.0.0.1:4319/health', reuseExistingServer: false},
  {command: 'node tests/helpers/pwa-server.mjs', url: 'http://127.0.0.1:4320', reuseExistingServer: false,
   env: {PUBLIC_SUPABASE_URL: 'https://floodnav-test.supabase.co', SUPABASE_URL: 'http://127.0.0.1:4319', SUPABASE_SERVICE_ROLE_KEY: 'test-service-role', PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_browser_test'} }
 ], reporter: 'list'
});
