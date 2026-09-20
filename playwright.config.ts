import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  timeout: 60000,
  use: {
    baseURL: "http://127.0.0.1:3000",
    headless: true,
    channel: process.env.PLAYWRIGHT_CHANNEL || "msedge",
  },
  webServer: {
    command: "npm --prefix client run dev -- --host 127.0.0.1",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: false,
    env: {
      PUBLIC_SUPABASE_URL: "https://floodnav-test.supabase.co",
      PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_browser_test",
    },
  },
  reporter: "list",
});
