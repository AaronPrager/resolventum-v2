import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    fileParallelism: false,
    // Makes Estella active for the run and puts her back afterwards; see src/test/anchors.ts.
    globalSetup: ["src/test/globalSetup.ts"],
  },
});
