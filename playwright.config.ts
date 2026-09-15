import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/global.setup.ts",
  globalTeardown: "./e2e/global.teardown.ts",
  timeout: 30_000,
  // Every test shares one local database, so files run one at a time.
  workers: 1,
  fullyParallel: false,
  use: { baseURL: "http://localhost:3100" },
  webServer: {
    // The tests sign in for real (dev auto sign-in off) and one of them signs a school up (sign-up open).
    command: "DISABLE_RATE_LIMIT=1 DEV_AUTO_LOGIN= REGISTRATION_OPEN=true npm run dev",
    url: "http://localhost:3100/login",
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    { name: "app", testMatch: /.*\.spec\.ts/, dependencies: ["setup"], use: { storageState: "e2e/.auth/user.json" } },
  ],
});
