import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  // Every test shares one local database, so files run one at a time.
  workers: 1,
  fullyParallel: false,
  use: { baseURL: "http://localhost:3100" },
  webServer: {
    // The tests sign in for real, so the dev auto sign-in is switched off for this server.
    command: "DISABLE_RATE_LIMIT=1 DEV_AUTO_LOGIN= npm run dev",
    url: "http://localhost:3100/login",
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    { name: "app", testMatch: /.*\.spec\.ts/, dependencies: ["setup"], use: { storageState: "e2e/.auth/user.json" } },
  ],
});
