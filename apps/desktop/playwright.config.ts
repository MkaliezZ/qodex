import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  timeout: 30000,
  retries: 1,
  use: { baseURL: "http://localhost:1420", screenshot: "only-on-failure" },
  webServer: { command: "pnpm dev", port: 1420, reuseExistingServer: true },
});
