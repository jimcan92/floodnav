import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  timeout: 60000,
  use: {
    baseURL: "http://127.0.0.1:4318",
    headless: true,
    channel:
      process.env.PLAYWRIGHT_CHANNEL === "chromium"
        ? undefined
        : process.env.PLAYWRIGHT_CHANNEL || "msedge",
  },
  webServer: [
    {
      command: "node tests/helpers/simulation-backend.mjs",
      url: "http://127.0.0.1:4319/health",
      reuseExistingServer: false,
    },
    {
      command: "npm --prefix client run dev -- --host 127.0.0.1 --port 4318",
      url: "http://127.0.0.1:4318",
      reuseExistingServer: false,
      env: {
        PUBLIC_SUPABASE_URL: "https://floodnav-test.supabase.co",
        SUPABASE_URL: "http://127.0.0.1:4319",
        SUPABASE_SERVICE_ROLE_KEY: "test-service-role",
        PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_browser_test",
      },
    },
  ],
  reporter: "list",
});
