import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  // Every test shares one local database, so files run one at a time.
  workers: 1,
  fullyParallel: false,
  use: { baseURL: "http://localhost:3100" },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3100",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
